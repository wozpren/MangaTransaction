"""
Manga OCR Web API Server
========================
基于 FastAPI 的 manga-ocr Web API 服务，供前端调用。

启动方式（在项目根目录并激活虚拟环境后）:
    python -m uvicorn server.ocr_server:app --host 127.0.0.1 --port 8787 --reload
"""

import base64
import io
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from PIL import Image
from manga_ocr import MangaOcr

# ==========================================
# 全局 OCR 实例（懒加载，首次请求时初始化）
# ==========================================
mocr = None


def get_ocr():
    """获取或初始化 MangaOcr 实例"""
    global mocr
    if mocr is None:
        print("[loading] 正在加载 manga-ocr 模型（首次加载需下载，请稍候）...")
        mocr = MangaOcr()
        print("[ok] manga-ocr 模型加载完成！")
    return mocr


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时预加载模型"""
    print("[start] OCR Server 启动中...")
    get_ocr()  # 预加载模型
    yield
    print("[stop] OCR Server 关闭")


# ==========================================
# FastAPI 应用
# ==========================================
app = FastAPI(
    title="Manga OCR API",
    description="基于 manga-ocr 的日文漫画 OCR Web 接口",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 配置：允许前端开发服务器访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# 请求/响应模型
# ==========================================
class OcrRequest(BaseModel):
    """OCR 请求：直接传入 base64 编码的图片"""
    image: str = Field(..., description="Base64 编码的图片数据（可带或不带 data:image/xxx;base64, 前缀）")


class OcrCropRequest(BaseModel):
    """OCR 裁剪请求：传入完整图片和裁剪区域"""
    image: str = Field(..., description="Base64 编码的完整页面图片")
    x: float = Field(..., description="裁剪区域左上角 X 坐标")
    y: float = Field(..., description="裁剪区域左上角 Y 坐标")
    width: float = Field(..., description="裁剪区域宽度")
    height: float = Field(..., description="裁剪区域高度")


class OcrBatchItem(BaseModel):
    """批量 OCR 中的单个项"""
    id: str = Field(..., description="文本框 ID")
    x: float
    y: float
    width: float
    height: float


class OcrBatchRequest(BaseModel):
    """批量 OCR 请求：传入完整图片和多个裁剪区域"""
    image: str = Field(..., description="Base64 编码的完整页面图片")
    boxes: list[OcrBatchItem] = Field(..., description="裁剪区域列表")


class OcrResponse(BaseModel):
    """OCR 响应"""
    text: str = Field(..., description="识别出的文字")
    elapsed_ms: float = Field(..., description="处理耗时（毫秒）")


class OcrBatchResultItem(BaseModel):
    """批量 OCR 响应中的单个结果"""
    id: str
    text: str


class OcrBatchResponse(BaseModel):
    """批量 OCR 响应"""
    results: list[OcrBatchResultItem]
    elapsed_ms: float


# ==========================================
# 辅助函数
# ==========================================
def decode_base64_image(image_data: str) -> Image.Image:
    """将 base64 字符串解码为 PIL Image"""
    # 去除 data URL 前缀（如果有）
    if ',' in image_data:
        image_data = image_data.split(',', 1)[1]

    try:
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        return image
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"无法解析图片数据: {str(e)}")


# ==========================================
# API 路由
# ==========================================
@app.get("/")
async def root():
    """健康检查"""
    return {"status": "ok", "service": "Manga OCR API", "model": "manga-ocr"}


@app.post("/ocr", response_model=OcrResponse)
async def ocr_image(request: OcrRequest):
    """
    对整张图片进行日文 OCR 识别。
    
    传入 base64 编码的图片，返回识别出的文字。
    适用于已经裁剪好的单个文本区域图片。
    """
    start = time.perf_counter()

    image = decode_base64_image(request.image)
    ocr = get_ocr()
    text = ocr(image)

    elapsed = (time.perf_counter() - start) * 1000
    return OcrResponse(text=text, elapsed_ms=round(elapsed, 2))


@app.post("/ocr/crop", response_model=OcrResponse)
async def ocr_crop(request: OcrCropRequest):
    """
    从完整图片中裁剪指定区域后进行 OCR 识别。
    
    传入完整页面图片和裁剪坐标，自动裁剪后识别文字。
    适用于前端将检测框坐标传过来的场景。
    """
    start = time.perf_counter()

    image = decode_base64_image(request.image)

    # 裁剪区域（确保不越界）
    x1 = max(0, int(request.x))
    y1 = max(0, int(request.y))
    x2 = min(image.width, int(request.x + request.width))
    y2 = min(image.height, int(request.y + request.height))

    if x2 <= x1 or y2 <= y1:
        raise HTTPException(status_code=400, detail="裁剪区域无效（宽度或高度为 0）")

    cropped = image.crop((x1, y1, x2, y2))
    ocr = get_ocr()
    text = ocr(cropped)

    elapsed = (time.perf_counter() - start) * 1000
    return OcrResponse(text=text, elapsed_ms=round(elapsed, 2))


@app.post("/ocr/batch", response_model=OcrBatchResponse)
async def ocr_batch(request: OcrBatchRequest):
    """
    批量 OCR：传入一张完整图片和多个文本框坐标，一次性识别所有框内的文字。
    
    适用于前端检测出多个文本框后，一次性发送全部框进行 OCR。
    """
    start = time.perf_counter()

    image = decode_base64_image(request.image)
    ocr = get_ocr()
    results = []

    for box in request.boxes:
        x1 = max(0, int(box.x))
        y1 = max(0, int(box.y))
        x2 = min(image.width, int(box.x + box.width))
        y2 = min(image.height, int(box.y + box.height))

        if x2 <= x1 or y2 <= y1:
            results.append(OcrBatchResultItem(id=box.id, text=""))
            continue

        cropped = image.crop((x1, y1, x2, y2))
        text = ocr(cropped)
        results.append(OcrBatchResultItem(id=box.id, text=text))

    elapsed = (time.perf_counter() - start) * 1000
    return OcrBatchResponse(results=results, elapsed_ms=round(elapsed, 2))
