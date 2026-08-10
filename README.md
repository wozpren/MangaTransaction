# MangaTransaction

一个面向日文漫画的本地辅助翻译与嵌字工具。它可以导入多张漫画图片，在浏览器中检测文字区域，通过本地 `manga-ocr` 服务识别日文，并提供文本框编辑、遮罩绘制和图片导出能力。

> 当前仍是实验性项目。自动检测依赖 WebGPU；翻译步骤目前以批量粘贴译文为主，设置页中的翻译服务配置尚未接入主工作流。

## 功能

- 批量导入 PNG、JPEG 和 WebP 漫画页面
- 使用 ONNX + WebGPU 自动检测文本框并生成文字遮罩
- 使用本地 `manga-ocr` 服务进行单页或批量日文 OCR
- 可选使用 SiliconFlow PaddleOCR-VL 或智谱 OCR
- 编辑文字内容、字体、字号、颜色、对齐方式和文本框位置
- 手动画笔、橡皮擦和遮罩编辑
- 按页面批量粘贴译文并导出处理后的 PNG

## 技术栈

- 前端：SvelteKit 2、Svelte 5、Vite 7、Tailwind CSS 4
- 浏览器推理：ONNX Runtime Web（WebGPU）
- OCR 服务：FastAPI、[manga-ocr](https://github.com/kha-white/manga-ocr)
- 文本检测模型：[comic-text-detector-onnx](https://huggingface.co/mayocream/comic-text-detector-onnx)

## 项目结构

```text
MangaTransaction/
├─ front/                  # SvelteKit 前端
│  ├─ src/                 # 页面与组件
│  └─ static/models/       # 下载后的文本检测模型（不提交到 Git）
├─ server/
│  ├─ ocr_server.py        # manga-ocr 的 FastAPI 封装
│  └─ requirements.txt     # Python 依赖
└─ scripts/
   └─ download-model.mjs   # 下载并校验文本检测模型
```

## 环境要求

- Node.js 20.19+ 或 22.12+
- pnpm 10+
- Python 3.9+（建议使用 Python 3.11 或 3.12）
- 支持 WebGPU 的新版 Chrome 或 Edge
- 首次安装及首次 OCR 启动时需要联网下载模型

没有 WebGPU 时仍可手动添加和编辑文本框，但自动文本检测不可用。

## 快速开始

### 1. 获取项目

```bash
git clone https://github.com/wozpren/MangaTransaction.git
cd MangaTransaction
```

### 2. 安装前端依赖并下载检测模型

```bash
cd front
pnpm install
pnpm setup:model
```

`setup:model` 会从 Hugging Face 下载约 95 MB 的 `comic-text-detector.onnx`，并校验 SHA-256。模型保存在 `front/static/models/`，不会进入 Git 仓库。

### 3. 创建 Python 环境

在项目根目录执行：

```bash
python -m venv venv
```

Windows PowerShell：

```powershell
.\venv\Scripts\Activate.ps1
python -m pip install -r server\requirements.txt
```

macOS / Linux：

```bash
source venv/bin/activate
python -m pip install -r server/requirements.txt
```

### 4. 启动

激活 Python 虚拟环境后，在 `front` 目录运行：

```bash
pnpm dev
```

这会同时启动前端开发服务器和 `http://localhost:8787` 上的 OCR 服务。浏览器访问终端中 Vite 显示的地址，通常为 `http://localhost:5173`。

也可以分别启动：

```bash
# 项目根目录：启动 OCR 服务
python -m uvicorn server.ocr_server:app --host 127.0.0.1 --port 8787

# front 目录：启动前端
pnpm dev:front
```

`manga-ocr` 首次启动时会下载约 400 MB 的模型，控制台出现 `manga-ocr 模型加载完成` 后即可使用。如果网络需要代理，请在启动进程前通过标准的 `HTTP_PROXY`、`HTTPS_PROXY` 或 Hugging Face 相关环境变量自行配置；项目不会写死本机代理地址。

## 使用流程

1. 上传或拖入漫画图片。
2. 使用自动检测生成文本框和遮罩，或手动创建文本框。
3. 启动本地 OCR 服务后执行当前页 OCR 或批量 OCR。
4. 校对原文，在翻译窗口按行粘贴译文。
5. 调整文字样式、位置与遮罩，然后导出 PNG。

## API 与隐私说明

- 上传的漫画图片默认在浏览器内读取；本地 OCR 会将图片数据发送到你自己的 `localhost:8787` 服务。
- 使用 SiliconFlow 或智谱 OCR 时，图片会直接从浏览器发送给对应服务商，请自行确认其隐私政策。
- API 密钥保存在浏览器 `localStorage` 中，不会提交到本仓库，但它不是加密存储。请勿在公共或不受信任的电脑上保存生产密钥。
- 仓库不包含测试用商业漫画页面、来源不明字体、本地备份、虚拟环境或未使用的大模型文件。

## 模型与第三方项目

- [kha-white/manga-ocr](https://github.com/kha-white/manga-ocr)：日文漫画 OCR，Apache-2.0。
- [mayocream/comic-text-detector-onnx](https://huggingface.co/mayocream/comic-text-detector-onnx)：浏览器端文本检测 ONNX 模型，模型页标注 Apache-2.0。

请同时遵守所使用模型、API 服务和输入图片各自的许可与使用条款。

## 项目许可

本仓库目前未附带项目级开源许可证。公开仓库仅表示源码可见，不代表自动授予复制、修改或再分发权利。第三方依赖和模型继续适用各自的许可证。

