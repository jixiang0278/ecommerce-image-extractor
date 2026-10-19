const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "../extension/gallery.js"), "utf8");

class Element {
  constructor() {
    this.listeners = new Map();
    this.children = [];
    this.classList = { toggle() {} };
    this.hidden = false;
    this.disabled = false;
  }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute() {}
  remove() {}
}

test("图库可选择图片，并在确认下载完成后显示成功进度和 PNG 文件名", async () => {
  const ids = new Map();
  const downloads = [];
  const get = (id) => {
    if (!ids.has(id)) ids.set(id, new Element());
    return ids.get(id);
  };
  const context = {
    document: {
      getElementById: get,
      createElement: (tag) => tag === "canvas" ? {
        getContext: () => ({ drawImage() {} }),
        toBlob: (callback) => callback({ type: "image/png" })
      } : new Element()
    },
    location: { search: "?id=123e4567-e89b-12d3-a456-426614174000" },
    URL: class extends URL { static createObjectURL() { return "blob:extension/test"; } static revokeObjectURL() {} },
    URLSearchParams,
    fetch: async () => ({ ok: true, blob: async () => ({}) }),
    createImageBitmap: async () => ({ width: 500, height: 500, close() {} }),
    chrome: {
      storage: { session: { get: async () => ({
        "gallery_123e4567-e89b-12d3-a456-426614174000": {
          sourceUrl: "https://item.jd.com/123.html",
          images: [{ url: "https://img.jd.com/item.jpg", width: 500, height: 500 }]
        }
      }) } },
      permissions: { contains: async () => true },
      downloads: {
        download: async (options) => { downloads.push(options); return 1; },
        search: async () => [{ state: "complete" }],
        onChanged: { addListener() {}, removeListener() {} }
      }
    }
  };
  vm.runInNewContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(get("selected-count").textContent, "已选 1 张");
  assert.equal(get("download").disabled, false);

  get("invert").listeners.get("click")();
  assert.equal(get("selected-count").textContent, "已选 0 张");
  assert.equal(get("download").disabled, true);
  get("select-all").listeners.get("click")();
  await get("download").listeners.get("click")();

  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].filename, "商品图_001.png");
  assert.equal(get("progress-number").textContent, "1 / 1");
  assert.equal(get("progress-label").textContent, "全部下载完成");
  assert.match(get("result").textContent, /成功 1 张，失败 0 张/);
});
