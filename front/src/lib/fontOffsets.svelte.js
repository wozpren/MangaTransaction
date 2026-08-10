/**
 * 字体标点符号偏移量管理
 */

const FONT_OFFSETS_STORAGE_KEY = 'manga-font-offsets';

// fontOffsets: { [fontFamily: string]: { x: number, y: number } }
export const fontOffsets = $state({});

export function loadFontOffsets() {
    try {
        const saved = localStorage.getItem(FONT_OFFSETS_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.assign(fontOffsets, parsed);
        }
    } catch (e) {
        console.error('Failed to load font offsets:', e);
    }
}

export function saveFontOffsets() {
    try {
        localStorage.setItem(FONT_OFFSETS_STORAGE_KEY, JSON.stringify(fontOffsets));
    } catch (e) {
        console.error('Failed to save font offsets:', e);
    }
}

export function updateFontOffset(fontFamily, key, value) {
    if (!fontOffsets[fontFamily]) {
        fontOffsets[fontFamily] = { x: 0, y: 0 };
    }
    fontOffsets[fontFamily][key] = value;
    saveFontOffsets();
}

export function getFontOffset(fontFamily) {
    return fontOffsets[fontFamily] || { x: 0, y: 0 };
}

// 确保在浏览器环境下加载
if (typeof localStorage !== 'undefined') {
    loadFontOffsets();
}
