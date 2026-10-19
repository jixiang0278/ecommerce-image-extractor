const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "../extension/content.js"), "utf8");

function loadPage(url, images = []) {
  const listeners = new Map();
  const messages = [];
  let button;
  const document = {
    baseURI: url,
    body: { append: (element) => { button = element; } },
    getElementById: () => button,
    createElement: () => ({
      addEventListener: (type, handler) => listeners.set(type, handler),
      setAttribute() {},
      remove() { button = undefined; }
    }),
    querySelectorAll: (selector) => selector === "img" ? images : []
  };
  const context = {
    document,
    location: new URL(url),
    URL,
    console,
    setInterval() {},
    setTimeout() {},
    getComputedStyle: () => ({ backgroundImage: "none" }),
    chrome: { runtime: { sendMessage: async (message) => { messages.push(message); return { ok: true }; } } }
  };
  vm.runInNewContext(source, context);
  return { button, listeners, messages };
}

function image(attributes, naturalWidth = 800, naturalHeight = 800) {
  return {
    currentSrc: attributes.src || "",
    naturalWidth,
    naturalHeight,
    width: naturalWidth,
    height: naturalHeight,
    alt: "商品展示图",
    className: "product-image",
    closest: () => null,
    getAttribute: (key) => attributes[key] || null
  };
}

test("悬浮按钮只显示在支持的商品详情页", () => {
  assert.ok(loadPage("https://detail.tmall.com/item.htm?id=123").button);
  assert.ok(loadPage("https://item.jd.com/123456.html").button);
  assert.ok(loadPage("https://mms.pinduoduo.com/goods/goods_detail?goods_id=123").button);
  assert.equal(loadPage("https://www.taobao.com/").button, undefined);
  assert.equal(loadPage("https://www.jd.com/").button, undefined);
});

test("提取懒加载和 srcset，补全相对地址、去重并过滤小图", async () => {
  const page = loadPage("https://detail.tmall.com/item.htm?id=123", [
    image({ src: "/large.jpg", "data-src": "/large.jpg", srcset: "/large.jpg 1x, /other.webp 2x" }),
    image({ src: "/icon.jpg" }, 32, 32),
    image({ "data-lazy-src": "//img.alicdn.com/lazy.jpg" })
  ]);
  await page.listeners.get("click")();
  assert.equal(page.messages.length, 1);
  const urls = Array.from(page.messages[0].images, (item) => item.url);
  assert.deepEqual(urls, [
    "https://detail.tmall.com/large.jpg",
    "https://detail.tmall.com/other.webp",
    "https://img.alicdn.com/lazy.jpg"
  ]);
});
