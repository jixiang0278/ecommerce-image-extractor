// 使用 session 存储在商品页和新标签页之间传递结果，避免把大量 URL 拼进地址栏。
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "OPEN_GALLERY") return;

  (async () => {
    if (!sender.tab?.id || !Array.isArray(message.images)) {
      throw new Error("无效的图片提取请求");
    }
    const id = crypto.randomUUID();
    const images = message.images.slice(0, 1500).filter((item) =>
      item && typeof item.url === "string" && /^https?:\/\//i.test(item.url)
    );
    await chrome.storage.session.set({
      [`gallery_${id}`]: {
        images,
        sourceUrl: sender.tab.url || "",
        createdAt: Date.now()
      }
    });
    await chrome.tabs.create({ url: chrome.runtime.getURL(`gallery.html?id=${id}`) });
    sendResponse({ ok: true });
  })().catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
