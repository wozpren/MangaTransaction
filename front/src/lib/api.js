// api.js
// 注意：导入 webgpu 版本的 ort
import * as ort from 'onnxruntime-web/webgpu';

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

export const apiSettings = {
    modelUrl: '/models/comic-text-detector.onnx', // 你导出的三合一 ONNX 模型
    confidenceThreshold: 0.125,
    iouThreshold: 0.7,
    maskThreshold: 0.5, // UNet 掩码的二值化阈值
    ocrApiKey: '',
    zhipuOcrApiKey: '',
    mangaOcrUrl: 'http://localhost:8787', // 本地 manga-ocr 服务地址
};

let cvSession = null;

// ==========================================
// 1. 模型初始化 (强制 WebGPU)
// ==========================================
export async function initModel() {
    if (cvSession) return cvSession;
    try {
        console.log("Initializing model with WebGPU...");
        cvSession = await ort.InferenceSession.create(apiSettings.modelUrl, {
            executionProviders: ['webgpu']
        });
        console.log("✅ Model loaded! WebGPU active.");
        console.log("Input nodes:", cvSession.inputNames);
        console.log("Output nodes:", cvSession.outputNames);
        return cvSession;
    } catch (e) {
        console.error("WebGPU initialization failed:", e);
        throw new Error("Unable to load model. Check WebGPU support or model path.");
    }
}

// ==========================================
// 2. 图像预处理 (严格 1024x1024 Letterbox)
// ==========================================
async function imageToTensor1024(imageUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const targetSize = 1024;
            const canvas = document.createElement('canvas');
            canvas.width = targetSize;
            canvas.height = targetSize;
            const ctx = canvas.getContext('2d');

            // 计算缩放比例和偏移，用于坐标映射还原
            const scale = Math.min(targetSize / img.width, targetSize / img.height);
            const newW = img.width * scale;
            const newH = img.height * scale;
            const padX = (targetSize - newW) / 2;
            const padY = (targetSize - newH) / 2;

            // YOLO 标准背景填充 (114)
            ctx.fillStyle = 'rgb(114, 114, 114)';
            ctx.fillRect(0, 0, targetSize, targetSize);
            ctx.drawImage(img, padX, padY, newW, newH);

            const imageData = ctx.getImageData(0, 0, targetSize, targetSize).data;
            const floatData = new Float32Array(1 * 3 * targetSize * targetSize);

            // HWC 转 CHW，并归一化到 0-1
            for (let i = 0; i < targetSize * targetSize; i++) {
                floatData[i] = imageData[i * 4] / 255.0;
                floatData[targetSize * targetSize + i] = imageData[i * 4 + 1] / 255.0;
                floatData[2 * targetSize * targetSize + i] = imageData[i * 4 + 2] / 255.0;
            }

            const tensor = new ort.Tensor('float32', floatData, [1, 3, targetSize, targetSize]);
            resolve({ tensor, origW: img.width, origH: img.height, scale, padX, padY });
        };
        img.onerror = reject;
        img.src = imageUrl;
    });
}

// ==========================================
// 3. 核心推理与多头输出分发
// ==========================================
export async function processComicPage(imageUrl) {
    if (!cvSession) await initModel();

    try {
        const { tensor, origW, origH, scale, padX, padY } = await imageToTensor1024(imageUrl);
        const feeds = { [cvSession.inputNames[0]]: tensor };
        const results = await cvSession.run(feeds);

        // 【注意】这里需要根据你实际控制台打印的输出节点名称进行映射！
        // 假设 outputNames[0] 是 YOLO 的框，outputNames[1] 是 UNet 的 Mask
        const yoloOutputName = cvSession.outputNames[0];
        const unetOutputName = cvSession.outputNames[1]; // 你可能需要调整这里的索引

        const yoloTensor = results[yoloOutputName];
        const unetTensor = results[unetOutputName];

        console.log(`Parsing YOLO dims: ${yoloTensor.dims}`);
        console.log(`Parsing UNet dims: ${unetTensor.dims}`);

        // 1. 解析文本框坐标 (还原到原图尺寸)
        const boxes = parseYoloBoxes(yoloTensor.data, yoloTensor.dims, origW, origH, scale, padX, padY);

        // 2. 提取像素级 Mask (生成 Base64 黑白图，供 LaMa 擦除使用)
        let maskBase64 = null;
        if (unetTensor) {
            maskBase64 = extractUNetMask(unetTensor.data, origW, origH, scale, padX, padY);
        }

        return {
            boxes: boxes,
            maskBase64: maskBase64 // 直接把这个发给你的后端 Inpainting 接口
        };

    } catch (e) {
        console.error("Inference failed:", e);
        throw e;
    }
}

// ==========================================
// 4. Tensor 解析：适配 comic-text-detector
// ==========================================
function parseYoloBoxes(outputData, dims, origW, origH, scale, padX, padY) {
    const numAnchors = 64512;
    const numFeatures = 7;
    let boxes = [];
    const targetSize = 1024;

    for (let i = 0; i < numAnchors; i++) {
        const offset = i * numFeatures;

        const objConf = outputData[offset + 4];  // 文本框置信度
        const engConf = outputData[offset + 5];  // 类别0: 英文概率
        const japConf = outputData[offset + 6];  // 类别1: 日文/中文概率

        // 计算真实置信度
        const maxClsConf = Math.max(engConf, japConf);
        const confidence = objConf * maxClsConf;

        // 【关键】如果你还是什么都识别不出，把 apiSettings.confidenceThreshold 降到 0.15 试试
        if (confidence > apiSettings.confidenceThreshold) {
            let cx = outputData[offset + 0];
            let cy = outputData[offset + 1];
            let w = outputData[offset + 2];
            let h = outputData[offset + 3];

            // 逆向映射回原图坐标系
            let x1 = (cx - w / 2 - padX) / scale;
            let y1 = (cy - h / 2 - padY) / scale;
            let width = w / scale;
            let height = h / scale;

            // 边界截断
            x1 = Math.max(0, Math.min(x1, origW));
            y1 = Math.max(0, Math.min(y1, origH));
            width = Math.min(width, origW - x1);
            height = Math.min(height, origH - y1);

            // 直接组装成你需要的格式
            boxes.push({
                id: crypto.randomUUID(),
                originalText: "",
                text: "",
                confidence: confidence,
                language: engConf > japConf ? "en" : "ja", // 自动识别语种！
                box: {
                    x: x1,
                    y: y1,
                    width: width,
                    height: height,
                    fontSize: 16,
                    color: "#000000",
                    bg: "transparent",
                    align: "center",
                    verticalAlign: "middle",
                    bold: false,
                    italic: false,
                }
            });
        }
    }

    // 执行 NMS 去重 (注意 NMS 里面访问坐标要改成 box.x, box.y)
    return nonMaxSuppression(boxes, apiSettings.iouThreshold);
}

// ==========================================
// 辅助算法：NMS (适配新的数据结构)
// ==========================================
function nonMaxSuppression(boxes, iouThreshold) {
    boxes.sort((a, b) => b.confidence - a.confidence);
    const result = [];
    while (boxes.length > 0) {
        const current = boxes.shift();
        result.push(current);
        boxes = boxes.filter(box => calculateIoU(current.box, box.box) < iouThreshold);
    }
    return result;
}

function calculateIoU(box1, box2) {
    const x1 = Math.max(box1.x, box2.x);
    const y1 = Math.max(box1.y, box2.y);
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);
    const intersect = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const area1 = box1.width * box1.height;
    const area2 = box2.width * box2.height;
    return intersect / (area1 + area2 - intersect);
}
// 辅助方法：统一处理坐标还原
function pushBox(boxes, cx, cy, w, h, confidence, origW, origH, scale, padX, padY, targetSize) {
    // 兼容处理：如果模型输出的是 0~1 的归一化坐标，先还原到 1024 尺度
    if (cx <= 1.5 && cy <= 1.5 && w <= 1.5 && h <= 1.5) {
        cx *= targetSize;
        cy *= targetSize;
        w *= targetSize;
        h *= targetSize;
    }

    // 逆向映射回原图坐标系
    let x1 = (cx - w / 2 - padX) / scale;
    let y1 = (cy - h / 2 - padY) / scale;
    let width = w / scale;
    let height = h / scale;

    // 边界截断，防止框超出原图
    x1 = Math.max(0, Math.min(x1, origW));
    y1 = Math.max(0, Math.min(y1, origH));
    width = Math.min(width, origW - x1);
    height = Math.min(height, origH - y1);

    boxes.push({
        x: x1, y: y1, width, height, confidence,
        id: crypto.randomUUID()
    });
}
// ==========================================
// 5. Tensor 解析：UNet 像素级掩码
// ==========================================
function extractUNetMask(maskData, origW, origH, scale, padX, padY) {
    const targetSize = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(targetSize, targetSize);

    // 1. 基础二值化：白色遮罩 + 透明背景
    for (let y = 0; y < targetSize; y++) {
        for (let x = 0; x < targetSize; x++) {
            const index = y * targetSize + x;
            const prob = maskData[index];
            const pixelIndex = index * 4;

            if (prob > apiSettings.maskThreshold) {
                // 白色
                imageData.data[pixelIndex] = 255;
                imageData.data[pixelIndex + 1] = 255;
                imageData.data[pixelIndex + 2] = 255;
                imageData.data[pixelIndex + 3] = 255; // 不透明
            } else {
                // 透明
                imageData.data[pixelIndex] = 0;
                imageData.data[pixelIndex + 1] = 0;
                imageData.data[pixelIndex + 2] = 0;
                imageData.data[pixelIndex + 3] = 0; // 关键：完全透明
            }
        }
    }
    ctx.putImageData(imageData, 0, 0);

    // 2. 还原到原图尺寸
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = origW;
    finalCanvas.height = origH;
    const finalCtx = finalCanvas.getContext('2d');

    const newW = origW * scale;
    const newH = origH * scale;

    finalCtx.drawImage(
        canvas,
        padX, padY, newW, newH,
        0, 0, origW, origH
    );

    // 3. 圆形扩张 (Dilate)
    const expandRadius = 2; // 如果需要精确 1 像素，设为 1；2 则更粗一点
    const expandedCanvas = document.createElement('canvas');
    expandedCanvas.width = origW;
    expandedCanvas.height = origH;
    const expCtx = expandedCanvas.getContext('2d');

    // 由于 finalCanvas 已经是“白色+透明”，
    // 简单的重复叠加（Source Over）就能实现白色的并集扩张
    const r2 = expandRadius * expandRadius;
    for (let dx = -expandRadius; dx <= expandRadius; dx++) {
        for (let dy = -expandRadius; dy <= expandRadius; dy++) {
            // 🌟 核心修复：勾股定理判断，只在圆形半径内绘制
            if (dx * dx + dy * dy <= r2) {
                expCtx.drawImage(finalCanvas, dx, dy);
            }
        }
    }

    return expandedCanvas.toDataURL('image/png');
}