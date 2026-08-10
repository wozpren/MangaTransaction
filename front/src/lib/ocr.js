import { apiSettings } from './api.js';
import { createDefaultBox } from './textDefaults.svelte.js';

/**
 * 获取 SiliconFlow API 密钥（用于 PaddleOCR 单框文字识别）
 */
function getSiliconFlowApiKey() {
    let apiKey = apiSettings.ocrApiKey;

    if (!apiKey) {
        try {
            const saved = localStorage.getItem('manga_trans_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                apiKey = parsed.ocrApiKey;
            }
        } catch (e) { }
    }

    if (!apiKey) {
        throw new Error("请在设置中配置 SiliconFlow OCR API 密钥");
    }
    return apiKey;
}

/**
 * 获取智谱 OCR API 密钥（用于全图 OCR）
 */
function getZhipuOcrApiKey() {
    let apiKey = apiSettings.zhipuOcrApiKey;

    if (!apiKey) {
        try {
            const saved = localStorage.getItem('manga_trans_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                apiKey = parsed.zhipuOcrApiKey;
            }
        } catch (e) { }
    }

    if (!apiKey) {
        throw new Error("请在设置中配置智谱 OCR API 密钥");
    }
    return apiKey;
}

/**
 * 使用 SiliconFlow PaddleOCR 识别文本框区域中的文字（原有功能）
 */
export async function recognizeText(dataUrl) {
    const apiKey = getSiliconFlowApiKey();

    const messages = {
        "role": "user",
        "content": [
            {
                "type": "image_url",
                "image_url": {
                    "url": dataUrl,
                    "detail": "auto"
                }
            },
            {
                "type": "text",
                "text": "识别日文"
            }
        ]
    }
    const jsonData = {
        "model": "PaddlePaddle/PaddleOCR-VL-1.5",
        "messages": [messages]
    }


    const fetchResponse = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(jsonData)
    });

    if (!fetchResponse.ok) {
        let errMessage = `HTTP error! status: ${fetchResponse.status}`;
        try {
            const errData = await fetchResponse.json();
            if (errData.error && errData.error.message) {
                errMessage += ` - ${errData.error.message}`;
            }
        } catch (e) { }
        throw new Error(errMessage);
    }

    const data = await fetchResponse.json();
    let texts = ""
    for (let index = 0; index < data.choices.length; index++) {
        const element = data.choices[index];
        texts += element.message.content;
    }

    return texts;
}

/**
 * 将 dataURL 转换为 Blob File 对象
 */
function dataUrlToFile(dataUrl, filename = 'image.png') {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
}

/**
 * 使用智谱 OCR API 进行全图 OCR 识别
 * 返回 words_result 数组，每项包含 location（位置）和 words（文字）
 * 
 * @param {string} imageDataUrl - 图片的 data URL
 * @param {string} languageType - 语言类型，默认 'JAP'
 * @returns {Promise<Array<{location: {left: number, top: number, width: number, height: number}, words: string, probability?: object}>>}
 */
export async function ocrFullPage(imageDataUrl, languageType = 'JAP') {
    const apiKey = getZhipuOcrApiKey();

    const file = dataUrlToFile(imageDataUrl, 'page.png');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('tool_type', 'hand_write');
    formData.append('language_type', languageType);
    formData.append('probability', 'true');

    const fetchResponse = await fetch('https://open.bigmodel.cn/api/paas/v4/files/ocr', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`
        },
        body: formData
    });

    if (!fetchResponse.ok) {
        let errMessage = `HTTP error! status: ${fetchResponse.status}`;
        try {
            const errData = await fetchResponse.json();
            if (errData.error && errData.error.message) {
                errMessage += ` - ${errData.error.message}`;
            }
        } catch (e) { }
        throw new Error(errMessage);
    }

    const data = await fetchResponse.json();

    if (data.status !== 'succeeded') {
        throw new Error(`OCR 任务失败: ${data.message || '未知错误'}`);
    }

    return data.words_result || [];
}

/**
 * 过滤掉过小的文本框（振假名/注音等）
 * 
 * @param {Array} wordsResult - OCR 返回的 words_result
 * @param {object} options - 过滤参数
 * @param {number} options.minArea - 最小面积阈值（默认 800 平方像素）
 * @param {number} options.minDimension - 最小宽或高阈值（默认 20 像素）
 * @returns {Array} 过滤后的结果
 */
function filterSmallBoxes(wordsResult, { minArea = 600, minDimension = 18 } = {}) {
    return wordsResult.filter((word) => {
        const { width, height } = word.location;
        const area = width * height;

        // 面积太小的直接排除（振假名通常非常小）
        if (area < minArea) {
            console.log(`[OCR Filter] 过滤小框: "${word.words}" (${width}x${height}, area=${area})`);
            return false;
        }

        // 两个维度都很小的排除（窄条形注音）
        if (width < minDimension || height < minDimension) {
            console.log(`[OCR Filter] 过滤小框: "${word.words}" (${width}x${height})`);
            return false;
        }

        return true;
    });
}

/**
 * 合并距离很近的文本框
 * 判断逻辑：两个框如果在水平或垂直方向上重叠/间距小于阈值，则合并
 * 
 * @param {Array} wordsResult - OCR 返回的 words_result
 * @param {number} mergeGap - 合并间距阈值（像素，默认 25）
 * @returns {Array} 合并后的结果
 */
function mergeNearbyBoxes(wordsResult, mergeGap = 20) {
    if (wordsResult.length <= 1) return wordsResult;

    // 复制一份避免修改原数组
    const boxes = wordsResult.map((w) => ({
        ...w,
        location: { ...w.location },
    }));

    // 用 Union-Find 思路：标记哪些框需要合并
    const merged = new Array(boxes.length).fill(false);
    const groups = []; // 每组是一个索引数组

    for (let i = 0; i < boxes.length; i++) {
        if (merged[i]) continue;

        const group = [i];
        merged[i] = true;

        // 不断扩展组：检查所有尚未归组的框是否和组内任意框接近
        let expanded = true;
        while (expanded) {
            expanded = false;
            for (let j = 0; j < boxes.length; j++) {
                if (merged[j]) continue;

                // 检查 j 是否与组内任意框接近
                const isNear = group.some((gi) => areBoxesNear(boxes[gi].location, boxes[j].location, mergeGap));
                if (isNear) {
                    group.push(j);
                    merged[j] = true;
                    expanded = true;
                }
            }
        }

        groups.push(group);
    }

    // 将每组合并为一个框
    return groups.map((group) => {
        if (group.length === 1) return boxes[group[0]];

        // 按从右到左、从上到下排序，方便拼接文本（日文竖排阅读顺序）
        const groupBoxes = group
            .map((i) => boxes[i])
            .sort((a, b) => {
                const aCenterX = a.location.left + a.location.width / 2;
                const bCenterX = b.location.left + b.location.width / 2;
                // 先从右到左
                if (Math.abs(aCenterX - bCenterX) > 30) {
                    return bCenterX - aCenterX;
                }
                // 同列从上到下
                return a.location.top - b.location.top;
            });

        // 计算包围盒
        let minLeft = Infinity, minTop = Infinity;
        let maxRight = -Infinity, maxBottom = -Infinity;
        const texts = [];

        for (const box of groupBoxes) {
            const { left, top, width, height } = box.location;
            minLeft = Math.min(minLeft, left);
            minTop = Math.min(minTop, top);
            maxRight = Math.max(maxRight, left + width);
            maxBottom = Math.max(maxBottom, top + height);
            if (box.words) texts.push(box.words);
        }

        console.log(`[OCR Merge] 合并 ${group.length} 个框: "${texts.join('')}"`);

        return {
            words: texts.join(''),
            location: {
                left: minLeft,
                top: minTop,
                width: maxRight - minLeft,
                height: maxBottom - minTop,
            },
        };
    });
}

/**
 * 判断两个框是否足够接近需要合并（基于中点距离）
 */
function areBoxesNear(loc1, loc2, gap) {
    // 计算两个框的中点
    const cx1 = loc1.left + loc1.width / 2;
    const cy1 = loc1.top + loc1.height / 2;
    const cx2 = loc2.left + loc2.width / 2;
    const cy2 = loc2.top + loc2.height / 2;

    // 计算中点之间的欧几里得距离
    const dist = Math.sqrt((cx1 - cx2) ** 2 + (cy1 - cy2) ** 2);

    // 两个框的平均半径（用于补偿框本身的大小）
    const avgHalfSize1 = (loc1.width + loc1.height) / 4;
    const avgHalfSize2 = (loc2.width + loc2.height) / 4;

    // 中点距离减去两个框的平均半径，得到近似边缘距离
    const edgeDist = dist - avgHalfSize1 - avgHalfSize2;

    return edgeDist <= gap;
}

/**
 * 将 OCR 识别结果转换为文本框 items 数组
 * 1. 过滤掉过小的框（振假名/注音）
 * 2. 合并距离很近的框
 * 3. 按照从右到左、从上到下的顺序排列（适合日文漫画阅读顺序）
 * 
 * @param {Array} wordsResult - ocrFullPage 返回的 words_result
 * @param {number} imageWidth - 原图宽度（用于从右到左排序）
 * @returns {Array} 格式化的 items 数组
 */
export function ocrResultToItems(wordsResult, imageWidth = 0) {
    if (!wordsResult || wordsResult.length === 0) return [];

    console.log(`[OCR] 原始结果: ${wordsResult.length} 个文本框`);

    // Step 1: 过滤小框（振假名等）
    let filtered = filterSmallBoxes(wordsResult);
    console.log(`[OCR] 过滤小框后: ${filtered.length} 个文本框`);

    // Step 2: 合并相邻的框
    let merged = mergeNearbyBoxes(filtered);
    console.log(`[OCR] 合并后: ${merged.length} 个文本框`);

    // Step 3: 按从右到左、从上到下排序
    const sorted = [...merged].sort((a, b) => {
        const aCenter = a.location.left + a.location.width / 2;
        const bCenter = b.location.left + b.location.width / 2;
        // 先按列分组（x 坐标差异大于阈值认为不同列）
        const columnThreshold = 50;
        if (Math.abs(aCenter - bCenter) > columnThreshold) {
            return bCenter - aCenter; // 从右到左
        }
        return a.location.top - b.location.top; // 同列内从上到下
    });

    return sorted.map((word) => ({
        id: crypto.randomUUID(),
        originalText: (word.words || '').replace(/，/g, '').replace(/！/g, '!').replace(/？/g, '?'),
        text: '',
        box: createDefaultBox({
            x: word.location.left,
            y: word.location.top,
            width: word.location.width,
            height: word.location.height,
        }),
    }));
}
