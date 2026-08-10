/**
 * 全局文本框默认样式管理 (Svelte 5 Reactive)
 * 
 * 新建文本框时的默认样式，初始值为"漫画默认"预设。
 * 支持全局字体设置。
 */

const DEFAULTS_STORAGE_KEY = 'manga-text-defaults';

// 漫画默认预设样式
const MANGA_DEFAULT_STYLE = {
    fontSize: 32,
    fontWeight: 600,
    fontFamily: 'inherit',
    color: '#000000',
    bg: 'transparent',
    bgOpacity: 100,
    align: 'center',
    verticalAlign: 'top',
    writingMode: 'vertical-rl',
    letterSpacing: 0,
    lineHeight: 1.4,
    strokeWidth: 0,
    strokeColor: '#ffffff',
    rotation: 0,
};

// 使用 Svelte 5 的 $state 创建全局响应式状态
export const textDefaults = $state({
    fontSize: MANGA_DEFAULT_STYLE.fontSize,
    fontWeight: MANGA_DEFAULT_STYLE.fontWeight,
    fontFamily: MANGA_DEFAULT_STYLE.fontFamily,
    color: MANGA_DEFAULT_STYLE.color,
    bg: MANGA_DEFAULT_STYLE.bg,
    bgOpacity: MANGA_DEFAULT_STYLE.bgOpacity,
    align: MANGA_DEFAULT_STYLE.align,
    verticalAlign: MANGA_DEFAULT_STYLE.verticalAlign,
    writingMode: MANGA_DEFAULT_STYLE.writingMode,
    letterSpacing: MANGA_DEFAULT_STYLE.letterSpacing,
    lineHeight: MANGA_DEFAULT_STYLE.lineHeight,
    strokeWidth: MANGA_DEFAULT_STYLE.strokeWidth,
    strokeColor: MANGA_DEFAULT_STYLE.strokeColor,
    rotation: MANGA_DEFAULT_STYLE.rotation,
});

/**
 * 从 localStorage 加载保存的默认样式
 */
export function loadDefaults() {
    try {
        const saved = localStorage.getItem(DEFAULTS_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.assign(textDefaults, parsed);
        }
    } catch (e) {
        console.error('Failed to load text defaults:', e);
    }
}

/**
 * 保存到 localStorage
 */
function saveDefaults() {
    try {
        localStorage.setItem(DEFAULTS_STORAGE_KEY, JSON.stringify(textDefaults));
    } catch (e) {
        console.error('Failed to save text defaults:', e);
    }
}

/**
 * 更新默认样式的某个属性
 */
export function updateDefault(key, value) {
    textDefaults[key] = value;
    saveDefaults();
}

/**
 * 批量更新默认样式
 */
export function updateDefaults(updates) {
    Object.assign(textDefaults, updates);
    saveDefaults();
}

/**
 * 设置全局默认字体
 */
export function setDefaultFont(fontFamily) {
    updateDefault('fontFamily', fontFamily);
}

/**
 * 创建新文本框时使用的 box 属性
 * 默认使用 fontFamily: 'inherit' 以便跟随全局设置，
 * 除非在创建时明确指定了其他字体。
 */
export function createDefaultBox(position) {
    return {
        x: position.x || 0,
        y: position.y || 0,
        width: position.width || 60,
        height: position.height || 180,
        fontSize: textDefaults.fontSize,
        fontWeight: textDefaults.fontWeight,
        fontFamily: 'inherit', // 默认为 inherit，使其响应全局字体变化
        color: textDefaults.color,
        bg: textDefaults.bg,
        bgOpacity: textDefaults.bgOpacity,
        align: textDefaults.align,
        verticalAlign: textDefaults.verticalAlign,
        writingMode: textDefaults.writingMode,
        letterSpacing: textDefaults.letterSpacing,
        lineHeight: textDefaults.lineHeight,
        strokeWidth: textDefaults.strokeWidth,
        strokeColor: textDefaults.strokeColor,
        rotation: textDefaults.rotation,
    };
}

// 导出 getter 以便向后兼容
export const getDefaults = () => ({ ...textDefaults });

// 加载初始值
if (typeof localStorage !== 'undefined') {
    loadDefaults();
}
