(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const grid = $("grid");
  const items = [];
  let downloading = false;

  function updateCounts() {
    $("total-count").textContent = String(items.length);
    const selected = items.filter((item) => item.checked).length;
    $("selected-count").textContent = `已选 ${selected} 张`;
    $("download").disabled = downloading || selected === 0;
    $("empty").hidden = items.length > 0;
  }

  function setChecked(item, checked) {
    item.checked = checked;
    item.checkbox.checked = checked;
    item.card.classList.toggle("selected", checked);
  }

  function removeSmallImage(item) {
    const index = items.indexOf(item);
    if (index === -1) return;
    items.splice(index, 1);
    item.card.remove();
    updateCounts();
  }

  function createCard(data, index) {
    const card = document.createElement("article");
    card.className = "card selected";
    const preview = document.createElement("div");
    preview.className = "preview";
    const image = document.createElement("img");
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.alt = `商品图 ${index + 1}`;
    image.src = data.url;
    const label = document.createElement("label");
    label.className = "checkbox";
    label.setAttribute("aria-label", `选择商品图 ${index + 1}`);
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    label.append(checkbox);
    preview.append(image, label);
    const meta = document.createElement("div");
    meta.className = "card-meta";
    const number = document.createElement("strong");
    number.textContent = `商品图 ${String(index + 1).padStart(3, "0")}`;
    const size = document.createElement("span");
    size.textContent = data.width && data.height ? `${data.width} × ${data.height}` : "尺寸读取中";
    meta.append(number, size);
    card.append(preview, meta);
    const item = { url: data.url, checked: true, card, checkbox, size };
    checkbox.addEventListener("change", () => { setChecked(item, checkbox.checked); updateCounts(); });
    image.addEventListener("load", () => {
      // 使用真实尺寸再次过滤懒加载图片及占位图。
      if (image.naturalWidth < 100 || image.naturalHeight < 100) { removeSmallImage(item); return; }
      size.textContent = `${image.naturalWidth} × ${image.naturalHeight}`;
    });
    image.addEventListener("error", () => { size.textContent = "预览不可用"; });
    items.push(item);
    grid.append(card);
  }

  async function ensureHostPermissions(urls) {
    const origins = [...new Set(urls.map((url) => {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.hostname}/*`;
    }))];
    const missing = [];
    for (const origin of origins) {
      if (!await chrome.permissions.contains({ origins: [origin] })) missing.push(origin);
    }
    if (!missing.length) return;
    // 仅请求这次选中图片实际使用的额外 CDN；Chrome 会显示授权弹窗。
    const granted = await chrome.permissions.request({ origins: missing });
    if (!granted) throw new Error("未授权部分图片所在的 CDN 域名");
  }

  async function convertToPng(url) {
    const response = await fetch(url, { credentials: "include", redirect: "follow" });
    if (!response.ok) throw new Error(`图片请求失败（HTTP ${response.status}）`);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    try {
      if (bitmap.width < 100 || bitmap.height < 100) throw new Error("图片尺寸过小");
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("无法创建图片画布");
      context.drawImage(bitmap, 0, 0);
      const png = await new Promise((resolve, reject) =>
        canvas.toBlob((output) => output ? resolve(output) : reject(new Error("PNG 转换失败")), "image/png")
      );
      return URL.createObjectURL(png);
    } finally { bitmap.close(); }
  }

  async function waitForDownload(id) {
    return new Promise((resolve, reject) => {
      const cleanup = () => chrome.downloads.onChanged.removeListener(onChange);
      const onChange = (delta) => {
        if (delta.id !== id || !delta.state) return;
        if (delta.state.current === "complete") { cleanup(); resolve(); }
        if (delta.state.current === "interrupted") { cleanup(); reject(new Error("浏览器中断了下载")); }
      };
      chrome.downloads.onChanged.addListener(onChange);
      chrome.downloads.search({ id }).then(([item]) => {
        if (item?.state === "complete") { cleanup(); resolve(); }
        if (item?.state === "interrupted") { cleanup(); reject(new Error("浏览器中断了下载")); }
      }).catch((error) => { cleanup(); reject(error); });
    });
  }

  async function downloadSelected() {
    if (downloading) return;
    const selected = items.filter((item) => item.checked);
    if (!selected.length) return;
    downloading = true;
    updateCounts();
    const panel = $("progress-panel");
    panel.hidden = false;
    $("progress").max = selected.length;
    $("progress").value = 0;
    $("progress-number").textContent = `0 / ${selected.length}`;
    $("progress-label").textContent = "正在准备下载";
    $("result").textContent = "";
    let success = 0;
    const failures = [];
    try {
      await ensureHostPermissions(selected.map((item) => item.url));
      for (const [index, item] of selected.entries()) {
        $("progress-label").textContent = `正在处理第 ${index + 1} 张图片`;
        let blobUrl;
        try {
          blobUrl = await convertToPng(item.url);
          const id = await chrome.downloads.download({
            url: blobUrl,
            filename: `商品图_${String(index + 1).padStart(3, "0")}.png`,
            saveAs: false,
            conflictAction: "uniquify"
          });
          if (typeof id !== "number") throw new Error("浏览器未接受下载请求");
          await waitForDownload(id);
          success++;
        } catch (error) {
          failures.push(`第 ${index + 1} 张：${error.message}`);
        } finally {
          if (blobUrl) URL.revokeObjectURL(blobUrl);
          $("progress").value = index + 1;
          $("progress-number").textContent = `${index + 1} / ${selected.length}`;
          $("result").textContent = `成功 ${success} 张，失败 ${failures.length} 张`;
        }
      }
      $("progress-label").textContent = failures.length ? "下载完成，部分图片失败" : "全部下载完成";
      if (failures.length) $("result").textContent += `。${failures.slice(0, 3).join("；")}`;
    } catch (error) {
      $("progress-label").textContent = "下载未开始";
      $("result").textContent = error.message;
    } finally { downloading = false; updateCounts(); }
  }

  async function init() {
    $("select-all").addEventListener("click", () => { items.forEach((item) => setChecked(item, true)); updateCounts(); });
    $("invert").addEventListener("click", () => { items.forEach((item) => setChecked(item, !item.checked)); updateCounts(); });
    $("download").addEventListener("click", downloadSelected);
    const id = new URLSearchParams(location.search).get("id");
    if (!id || !/^[a-f\d-]{36}$/i.test(id)) { $("source").textContent = "无效的图片列表"; updateCounts(); return; }
    const key = `gallery_${id}`;
    const stored = (await chrome.storage.session.get(key))[key];
    if (!stored || !Array.isArray(stored.images)) { $("source").textContent = "图片列表已过期，请重新提取"; updateCounts(); return; }
    $("source").textContent = stored.sourceUrl ? `来源：${stored.sourceUrl}` : "当前商品页";
    stored.images.forEach(createCard);
    updateCounts();
  }
  init().catch((error) => { $("source").textContent = `加载失败：${error.message}`; updateCounts(); });
})();
