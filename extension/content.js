(() => {
  "use strict";
  const BUTTON_ID = "ecom-image-extractor-button";
  const MIN_SIZE = 100;
  const LAZY_ATTRS = ["data-src", "data-lazy-src", "data-original", "data-ks-lazyload", "data-img", "data-image", "data-url", "data-lazyload-src"];
  const BAD_HINT = /(?:avatar|icon|logo|sprite|placeholder|loading|spinner|qrcode|二维码|头像|店铺标志)/i;
  const BAD_ANCESTOR = "header, footer, nav, aside, [role='navigation'], [class*='toolbar'], [class*='sidebar']";

  function isDetailPage() {
    const host = location.hostname.toLowerCase();
    const path = location.pathname.toLowerCase();
    const query = location.search.toLowerCase();
    if (/(^|\.)taobao\.com$|(^|\.)tmall\.com$/.test(host)) {
      return /(?:item\.htm|detail|\/item\/)/.test(path) && /(?:[?&]id=|\/item\/|detail)/.test(path + query);
    }
    if (/(^|\.)jd\.com$/.test(host)) {
      return /(?:^item\.jd\.com$|^item\.m\.jd\.com$)/.test(host) && /\/[0-9]+\.html$/.test(path)
        || /\/product\/[0-9]+/.test(path);
    }
    if (/(^|\.)pinduoduo\.com$|(^|\.)yangkeduo\.com$/.test(host)) {
      return /(?:goods|product|detail)/.test(path + query) && /(?:goods_id|goodsid|product_id|detail|\/goods\/)/.test(path + query);
    }
    return false;
  }

  function absoluteUrl(value) {
    if (!value || /^(?:data:|blob:|javascript:|about:)/i.test(value.trim())) return null;
    try {
      const url = new URL(value.trim().replace(/^['"]|['"]$/g, ""), document.baseURI);
      if (!/^https?:$/.test(url.protocol)) return null;
      url.hash = "";
      return url.href;
    } catch { return null; }
  }

  function srcsetUrls(value) {
    // srcset 中的逗号分隔候选图，按原始顺序保留，后续统一去重。
    return (value || "").split(",").map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);
  }

  function backgroundUrls(value) {
    const urls = [];
    const pattern = /url\(\s*(["']?)(.*?)\1\s*\)/gi;
    for (const match of (value || "").matchAll(pattern)) urls.push(match[2]);
    return urls;
  }

  function isProductCandidate(element, url, width, height) {
    if (!url || BAD_HINT.test(url)) return false;
    if (element.closest?.(BAD_ANCESTOR)) return false;
    const label = `${element.alt || ""} ${element.className?.baseVal || element.className || ""}`;
    if (BAD_HINT.test(label)) return false;
    if (width > 0 && height > 0 && (width < MIN_SIZE || height < MIN_SIZE)) return false;
    return true;
  }

  function collectImages() {
    const results = new Map();
    const add = (raw, element, width = 0, height = 0) => {
      const url = absoluteUrl(raw);
      if (!isProductCandidate(element, url, width, height)) return;
      if (!results.has(url)) results.set(url, { url, width, height });
      else {
        const existing = results.get(url);
        existing.width = Math.max(existing.width, width);
        existing.height = Math.max(existing.height, height);
      }
    };

    // 页面部分图片区是懒加载的：优先收集真实地址，同时保留 currentSrc/src/srcset。
    for (const img of document.querySelectorAll("img")) {
      const width = img.naturalWidth || 0;
      const height = img.naturalHeight || 0;
      if (img.width && img.height && img.width < MIN_SIZE && img.height < MIN_SIZE) continue;
      add(img.currentSrc, img, width, height);
      add(img.getAttribute("src"), img, width, height);
      for (const attr of LAZY_ATTRS) add(img.getAttribute(attr), img);
      for (const url of srcsetUrls(img.getAttribute("srcset"))) add(url, img);
    }
    for (const source of document.querySelectorAll("picture source")) {
      for (const url of srcsetUrls(source.getAttribute("srcset"))) add(url, source);
    }
    // 背景图只在商品详情页按需扫描；限制节点数，避免大型页面卡顿。
    const nodes = document.querySelectorAll("[style*='background'], [class*='image'], [class*='img'], [class*='photo'], [class*='detail']");
    for (const element of Array.from(nodes).slice(0, 5000)) {
      const inline = element.style?.backgroundImage || "";
      const computed = getComputedStyle(element).backgroundImage;
      for (const url of backgroundUrls(`${inline},${computed}`)) {
        add(url, element, element.clientWidth || 0, element.clientHeight || 0);
      }
    }
    return Array.from(results.values());
  }

  async function handleClick(button) {
    button.disabled = true;
    button.textContent = "正在提取…";
    try {
      const images = collectImages();
      if (!images.length) {
        button.textContent = "未找到图片";
        return;
      }
      const reply = await chrome.runtime.sendMessage({ type: "OPEN_GALLERY", images });
      if (!reply?.ok) throw new Error(reply?.error || "无法打开图片列表");
      button.textContent = `已找到 ${images.length} 张`;
    } catch (error) {
      console.error("图片提取失败", error);
      button.textContent = "提取失败，重试";
    } finally {
      setTimeout(() => { button.disabled = false; button.textContent = "获取图片"; }, 1800);
    }
  }

  function syncButton() {
    let button = document.getElementById(BUTTON_ID);
    if (!isDetailPage()) { button?.remove(); return; }
    if (button || !document.body) return;
    button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "获取图片";
    button.setAttribute("aria-label", "获取当前商品页图片");
    button.addEventListener("click", () => handleClick(button));
    document.body.append(button);
  }

  // 商家后台常使用前端路由，地址变化后同步悬浮按钮。
  syncButton();
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; syncButton(); }
  }, 1000);
})();
