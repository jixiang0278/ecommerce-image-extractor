# 电商图片提取器

Chrome Manifest V3 扩展：在淘宝、天猫、京东及拼多多商家版商品详情页提取图片，集中预览、勾选，并批量转换为 PNG 下载。官网源码位于 `site/dist/`。

## 文件结构

```text
ecommerce-image-extractor/
├── extension/
│   ├── manifest.json
│   ├── content.js
│   ├── content.css
│   ├── background.js
│   ├── gallery.html
│   ├── gallery.js
│   └── gallery.css
├── site/dist/
│   ├── index.html
│   ├── styles.css
│   └── ecommerce-image-extractor.zip
├── docs/需求分析与AI编程提示词.md
└── README.md
```

## 安装与使用

1. 打开 `chrome://extensions`，启用右上角「开发者模式」。
2. 点击「加载已解压的扩展程序」，选择本项目的 `extension` 文件夹。
3. 打开支持平台的商品详情页，点击右下角「获取图片」。
4. 在新标签页勾选图片，点击「下载选中图片」，等待进度和结果提示。

图片会按 `商品图_001.png` 等名称保存到浏览器默认下载目录。重复文件名由 Chrome 自动追加后缀。

## 实现说明

- `content.js` 只在识别到商品详情页地址时显示悬浮按钮。它扫描 `img`、`srcset`、常见懒加载属性和背景图，过滤已知图标、小图并去重。
- `background.js` 将图片列表放入 `chrome.storage.session`，打开扩展图库页。
- `gallery.js` 使用扩展页权限获取原图，通过 Canvas 转成 PNG，再使用 `chrome.downloads` 保存。非预授权 CDN 首次下载时会请求该域名访问权限。
- 下载进度按 Chrome 报告的 `complete` 或 `interrupted` 事件更新；某张失败不会中断其余图片。

## 使用范围与限制

电商平台经常修改页面结构和图片 CDN。插件覆盖常见商品详情路由及图片属性，但新路由、需登录的图片、反盗链资源、跨域重定向或不允许浏览器解码的格式可能无法提取或转换；图库会显示失败数量与原因。若商品页是前端路由，按钮会在 URL 变化后自动更新。网页中的短视频不在提取范围内。

只下载有使用权的图片，并遵守对应平台规则。
