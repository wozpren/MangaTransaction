<script>
    import { onMount } from "svelte";
    import { get, set } from "idb-keyval";
    import { textDefaults } from "./textDefaults.svelte.js";
    import { fontOffsets, updateFontOffset, getFontOffset } from "./fontOffsets.svelte.js";
    import { showToast } from "./toast.js";
    import {
        AlignLeft,
        AlignCenter,
        AlignRight,
        AlignStartVertical,
        AlignCenterVertical,
        AlignEndVertical,
        Type,
        PaintBucket,
        Trash2,
        Maximize2,
        Brush,
        Eraser,
        Baseline,
        Languages,
        Bookmark,
        Plus,
        X,
        Upload,
        Check,
        Palette,
        Space,
        ALargeSmall,
    } from "lucide-svelte";

    let {
        activeItem,
        onUpdate,
        onDelete,
        onApplyPresetToPage,
        onApplyPresetToAll,
    } = $props();
    let box = $derived({ ...(activeItem?.box || textDefaults) });

    // ========================
    // Style Presets State
    // ========================
    const PRESETS_STORAGE_KEY = "manga-style-presets";
    const FONTS_STORAGE_KEY = "manga-custom-fonts";

    let stylePresets = $state([]);
    let isAddingPreset = $state(false);
    let newPresetName = $state("");
    let presetNameInput = $state(null);

    // ========================
    // Custom Fonts State
    // ========================
    let customFonts = $state([]);

    // Context Menu State
    let contextMenuPreset = $state(null);
    let contextMenuPos = $state({ x: 0, y: 0 });

    function handleContextMenu(e, preset) {
        e.preventDefault();
        console.log("handleContextMenu", e, preset);
        contextMenuPreset = preset;
        contextMenuPos = { x: e.clientX, y: e.clientY };
    }

    function handleCloseContextMenu() {
        contextMenuPreset = null;
    }

    function updateExistingPreset(preset) {
        if (!activeItem) return;
        const source = box;
        preset.style = {
            fontSize: source.fontSize,
            fontWeight: source.fontWeight || (source.bold ? 700 : 400),
            fontFamily: source.fontFamily || "inherit",
            color: source.color,
            bg: source.bg || "transparent",
            bgOpacity: source.bgOpacity ?? 100,
            align: source.align || "center",
            verticalAlign: source.verticalAlign || "top",
            writingMode: source.writingMode || "horizontal-tb",
            letterSpacing: source.letterSpacing ?? 0,
            lineHeight: source.lineHeight ?? 1.4,
            strokeWidth: source.strokeWidth ?? 0,
            strokeColor: source.strokeColor ?? "#ffffff",
            rotation: source.rotation ?? 0,
        };
        const index = stylePresets.findIndex((p) => p.id === preset.id);
        if (index !== -1) {
            stylePresets[index] = preset;
            stylePresets = [...stylePresets];
            savePresetsToStorage();
        }
    }

    // Built-in presets
    const BUILT_IN_PRESETS = [
        {
            id: "__builtin_manga_default",
            name: "漫画默认",
            builtin: true,
            style: {
                fontSize: 32,
                fontWeight: 600,
                fontFamily: "inherit",
                color: "#000000",
                bg: "transparent",
                bgOpacity: 100,
                align: "center",
                writingMode: "vertical-rl",
                rotation: 0,
            },
        },
        {
            id: "__builtin_white_on_black",
            name: "白字黑底",
            builtin: true,
            style: {
                fontSize: 24,
                fontWeight: 700,
                fontFamily: "inherit",
                color: "#ffffff",
                bg: "#000000",
                bgOpacity: 100,
                align: "center",
                writingMode: "vertical-rl",
                rotation: 0,
            },
        },
        {
            id: "__builtin_horizontal",
            name: "横排黑字",
            builtin: true,
            style: {
                fontSize: 20,
                fontWeight: 400,
                fontFamily: "inherit",
                color: "#000000",
                bg: "transparent",
                bgOpacity: 100,
                align: "center",
                writingMode: "horizontal-tb",
                rotation: 0,
            },
        },
        {
            id: "__builtin_bold_emphasis",
            name: "加粗强调",
            builtin: true,
            style: {
                fontSize: 28,
                fontWeight: 900,
                fontFamily: "inherit",
                color: "#1a1a1a",
                bg: "transparent",
                bgOpacity: 100,
                align: "center",
                writingMode: "vertical-rl",
                rotation: 0,
            },
        },
    ];

    onMount(async () => {
        try {
            const saved = localStorage.getItem(PRESETS_STORAGE_KEY);
            if (saved) {
                stylePresets = JSON.parse(saved);
            }
        } catch (e) {
            console.error("Failed to load presets:", e);
        }

        try {
            let savedFonts = await get(FONTS_STORAGE_KEY);

            // Migrate from localStorage if exists
            if (!savedFonts) {
                const legacyFonts = localStorage.getItem(FONTS_STORAGE_KEY);
                if (legacyFonts) {
                    savedFonts = JSON.parse(legacyFonts);
                    await set(FONTS_STORAGE_KEY, savedFonts);
                    localStorage.removeItem(FONTS_STORAGE_KEY);
                }
            }

            if (savedFonts) {
                customFonts = savedFonts;
                customFonts.forEach((font) => registerFont(font, false));
                updateCustomFontsStyle();
            }
        } catch (e) {
            console.error("Failed to load custom fonts:", e);
        }
    });

    function updateCustomFontsStyle() {
        let styleTag = document.getElementById("manga-custom-fonts-style");
        if (!styleTag) {
            styleTag = document.createElement("style");
            styleTag.id = "manga-custom-fonts-style";
            document.head.appendChild(styleTag);
        }

        const rules = customFonts
            .map(
                (font) => `
            @font-face {
                font-family: '${font.name}';
                src: url(${font.data});
            }
        `,
            )
            .join("\n");

        styleTag.textContent = rules;
    }

    function savePresetsToStorage() {
        try {
            localStorage.setItem(
                PRESETS_STORAGE_KEY,
                JSON.stringify(stylePresets),
            );
        } catch (e) {
            console.error("Failed to save presets:", e);
        }
    }

    async function saveFontsToStorage() {
        try {
            await set(FONTS_STORAGE_KEY, $state.snapshot(customFonts));
        } catch (e) {
            console.error("Failed to save fonts:", e);
        }
    }

    function saveCurrentAsPreset() {
        // 使用 activeItem 的 box
        const source = activeItem ? box : null;
        if (!source || !newPresetName.trim()) return;

        const preset = {
            id: crypto.randomUUID(),
            name: newPresetName.trim(),
            builtin: false,
            style: {
                fontSize: source.fontSize,
                fontWeight: source.fontWeight || (source.bold ? 700 : 400),
                fontFamily: source.fontFamily || "inherit",
                color: source.color,
                bg: source.bg || "transparent",
                bgOpacity: source.bgOpacity ?? 100,
                align: source.align || "center",
                verticalAlign: source.verticalAlign || "top",
                writingMode: source.writingMode || "horizontal-tb",
                letterSpacing: source.letterSpacing ?? 0,
                lineHeight: source.lineHeight ?? 1.4,
                strokeWidth: source.strokeWidth ?? 0,
                strokeColor: source.strokeColor ?? "#ffffff",
                rotation: source.rotation ?? 0,
            },
        };
        stylePresets.push(preset);
        savePresetsToStorage();
        newPresetName = "";
        isAddingPreset = false;
    }

    function applyPreset(preset) {
        if (activeItem) {
            // 应用到当前选中的文本框
            onUpdate({
                ...activeItem,
                box: {
                    ...activeItem.box,
                    fontSize: preset.style.fontSize,
                    fontWeight: preset.style.fontWeight,
                    fontFamily: preset.style.fontFamily,
                    color: preset.style.color,
                    bg: preset.style.bg,
                    bgOpacity: preset.style.bgOpacity,
                    align: preset.style.align,
                    verticalAlign: preset.style.verticalAlign || "top",
                    writingMode: preset.style.writingMode,
                    letterSpacing: preset.style.letterSpacing ?? 0,
                    lineHeight: preset.style.lineHeight ?? 1.4,
                    strokeWidth: preset.style.strokeWidth ?? 0,
                    strokeColor: preset.style.strokeColor ?? "#ffffff",
                    rotation: preset.style.rotation ?? 0,
                },
            });
        }
    }

    function isPresetActive(preset) {
        const target = activeItem ? box : null;
        if (!target) return false;

        return (
            target.fontSize === preset.style.fontSize &&
            (target.fontWeight || (target.bold ? 700 : 400)) ===
                preset.style.fontWeight &&
            target.color === preset.style.color &&
            (target.bg || "transparent") === preset.style.bg &&
            (target.fontFamily || "inherit") === preset.style.fontFamily &&
            (target.writingMode || "horizontal-tb") === preset.style.writingMode
        );
    }

    function deletePreset(presetId) {
        stylePresets = stylePresets.filter((p) => p.id !== presetId);
        savePresetsToStorage();
    }

    // ========================
    // Font Upload Functions
    // ========================
    function registerFont(fontData, isNew = true) {
        const fontFace = new FontFace(fontData.name, `url(${fontData.data})`);
        fontFace
            .load()
            .then((loaded) => {
                document.fonts.add(loaded);
                console.log(`Font "${fontData.name}" registered successfully.`);
            })
            .catch((err) => {
                console.error(`Failed to load font "${fontData.name}":`, err);
            });
    }

    function handleFontUpload() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".ttf,.otf,.woff,.woff2";
        input.multiple = true;

        input.onchange = async (e) => {
            const files = Array.from(e.target.files);
            for (const file of files) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const fontName = file.name
                        .replace(/\.[^/.]+$/, "")
                        .replace(/[^a-zA-Z0-9\u4e00-\u9fff\s-_]/g, "")
                        .trim();

                    const fontData = {
                        id: crypto.randomUUID(),
                        name: fontName || `Custom_${Date.now()}`,
                        fileName: file.name,
                        data: event.target.result,
                    };

                    if (customFonts.some((f) => f.name === fontData.name)) {
                        showToast(`字体 "${fontData.name}" 已存在！`);
                        return;
                    }

                    customFonts.push(fontData);
                    registerFont(fontData);
                    updateCustomFontsStyle();
                    saveFontsToStorage();
                };
                reader.readAsDataURL(file);
            }
        };

        input.click();
    }

    function deleteFont(fontId) {
        const font = customFonts.find((f) => f.id === fontId);
        if (font) {
            customFonts = customFonts.filter((f) => f.id !== fontId);
            updateCustomFontsStyle();
            saveFontsToStorage();
        }
    }

    // ========================
    // Original functions
    // ========================
    function updateBoxProp(key, value) {
        if (activeItem) {
            onUpdate({
                ...activeItem,
                box: { ...activeItem.box, [key]: value },
            });
        }
    }

    function getPresetPreviewColor(preset) {
        return preset.style.color || "#000000";
    }

    function getPresetPreviewBg(preset) {
        const bg = preset.style.bg;
        return bg && bg !== "transparent" ? bg : "#ffffff";
    }
</script>

<svelte:window onclick={handleCloseContextMenu} />

{#if contextMenuPreset}
    <div
        class="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-32 text-sm"
        style="left: {contextMenuPos.x}px; top: {contextMenuPos.y}px;"
    >
        <button
            class="w-full text-left px-3 py-1.5 hover:bg-indigo-50 text-gray-700 transition"
            onclick={(e) => {
                e.stopPropagation();
                if (onApplyPresetToPage) onApplyPresetToPage(contextMenuPreset);
                handleCloseContextMenu();
            }}
        >
            应用当前页
        </button>
        <button
            class="w-full text-left px-3 py-1.5 hover:bg-indigo-50 text-gray-700 transition"
            onclick={(e) => {
                e.stopPropagation();
                if (onApplyPresetToAll) onApplyPresetToAll(contextMenuPreset);
                handleCloseContextMenu();
            }}
        >
            应用全部页
        </button>
        {#if !contextMenuPreset.builtin}
            <button
                class="w-full text-left px-3 py-1.5 hover:bg-indigo-50 text-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!activeItem}
                onclick={(e) => {
                    e.stopPropagation();
                    updateExistingPreset(contextMenuPreset);
                    handleCloseContextMenu();
                }}
                title={!activeItem ? "请先选择一个文本框获取样式" : ""}
            >
                更新预设
            </button>
        {/if}
    </div>
{/if}

{#snippet presetSection()}
    <div class="space-y-3 mb-5">
        <div class="flex items-center justify-between">
            <label
                class="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1.5"
            >
                <Palette size={13} />
                样式预设
            </label>
            <button
                class="p-1 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                aria-label="添加样式预设"
                onclick={() => {
                    isAddingPreset = !isAddingPreset;
                    if (isAddingPreset) {
                        newPresetName = "";
                        setTimeout(() => presetNameInput?.focus(), 50);
                    }
                }}
                title="保存当前样式为预设"
            >
                <Plus size={16} />
            </button>
        </div>

        {#if isAddingPreset}
            <div
                class="flex gap-1.5 items-center bg-indigo-50/60 p-2 rounded-lg border border-indigo-100 animate-in"
            >
                <input
                    bind:this={presetNameInput}
                    type="text"
                    class="flex-1 text-sm px-2 py-1.5 border border-indigo-200 rounded-md outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                    placeholder="预设名称..."
                    bind:value={newPresetName}
                    onkeydown={(e) => {
                        if (e.key === "Enter") saveCurrentAsPreset();
                        if (e.key === "Escape") isAddingPreset = false;
                    }}
                />
                <button
                    class="p-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-40"
                    onclick={saveCurrentAsPreset}
                    disabled={!newPresetName.trim()}
                    title="保存"
                >
                    <Check size={14} />
                </button>
                <button
                    class="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    onclick={() => (isAddingPreset = false)}
                    title="取消"
                >
                    <X size={14} />
                </button>
            </div>
        {/if}

        <div class="grid grid-cols-2 gap-1.5">
            {#each [...BUILT_IN_PRESETS, ...stylePresets] as preset (preset.id)}
                <div
                    role="button"
                    tabindex="50"
                    class="group relative flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left text-xs font-medium transition-all hover:shadow-sm cursor-pointer {isPresetActive(
                        preset,
                    )
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-200 hover:bg-indigo-50/30'}"
                    onclick={() => applyPreset(preset)}
                    oncontextmenu={(e) => {
                        e.stopPropagation(); // 阻止事件冒泡
                        e.preventDefault();
                        handleContextMenu(e, preset);
                    }}
                    onkeydown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            applyPreset(preset);
                        }
                    }}
                    title={`应用预设: ${preset.name}`}
                >
                    <span
                        class="shrink-0 w-5 h-5 rounded-md border border-gray-200 flex items-center justify-center text-[9px] font-bold shadow-inner"
                        style="background: {getPresetPreviewBg(
                            preset,
                        )}; color: {getPresetPreviewColor(preset)};"
                    >
                        文
                    </span>
                    <span class="truncate flex-1">{preset.name}</span>
                    {#if !preset.builtin}
                        <div
                            class="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all"
                        >
                            <button
                                class="p-0.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50"
                                onclick={(e) => {
                                    e.stopPropagation();
                                    deletePreset(preset.id);
                                }}
                                title="删除预设"
                                aria-label="删除预设"
                            >
                                <X size={10} />
                            </button>
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    </div>
    <hr class="border-gray-100 mb-5" />
{/snippet}

<div class="space-y-6">
    {#if !activeItem}
        <div
            class="flex flex-col items-center justify-center p-6 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200 mt-4 animate-in fade-in"
        >
            <Type size={32} class="mb-2 opacity-50" />
            <p class="text-sm">请选择一个文本框</p>
            <p class="text-xs mt-1">在右侧点击文本框来修改其属性</p>
        </div>
    {:else}
        {@render presetSection()}
        <div class="space-y-2 animate-in fade-in transition-all">
            <label
                for="text-content-input"
                class="text-xs font-semibold text-gray-500 uppercase"
                >文本内容</label
            >
            <textarea
                id="text-content-input"
                class="w-full text-sm p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-y min-h-[60px]"
                value={activeItem.text || ""}
                oninput={(e) =>
                    onUpdate({ ...activeItem, text: e.target.value })}
                placeholder="输入文本..."
            ></textarea>
        </div>
        <div class="space-y-1">
            <label
                for="font-size-slider"
                class="text-xs font-semibold text-gray-500 uppercase flex items-center justify-between"
            >
                <span>字体大小</span>
                <span class="text-indigo-600 font-medium">{box.fontSize}px</span
                >
            </label>
            <input
                id="font-size-slider"
                type="range"
                min="8"
                max="72"
                value={box.fontSize}
                oninput={(e) =>
                    updateBoxProp("fontSize", parseInt(e.target.value))}
                class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
        </div>

        <div class="space-y-1">
            <label
                for="font-weight-slider"
                class="text-xs font-semibold text-gray-500 uppercase flex items-center justify-between"
            >
                <span>字重 (粗细)</span>
                <span class="text-indigo-600 font-medium"
                    >{box.fontWeight || (box.bold ? 700 : 400)}</span
                >
            </label>
            <input
                id="font-weight-slider"
                type="range"
                min="100"
                max="900"
                step="100"
                value={box.fontWeight || (box.bold ? 700 : 400)}
                oninput={(e) =>
                    updateBoxProp("fontWeight", parseInt(e.target.value))}
                class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
        </div>

        <div class="space-y-1">
            <label
                for="letter-spacing-slider"
                class="text-xs font-semibold text-gray-500 uppercase flex items-center justify-between"
            >
                <span>字间距</span>
                <span class="text-indigo-600 font-medium"
                    >{box.letterSpacing ?? 0}px</span
                >
            </label>
            <input
                id="letter-spacing-slider"
                type="range"
                min="0"
                max="20"
                step="0.5"
                value={box.letterSpacing ?? 0}
                oninput={(e) =>
                    updateBoxProp("letterSpacing", parseFloat(e.target.value))}
                class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
        </div>

        <div class="space-y-1">
            <label
                for="rotation-slider"
                class="text-xs font-semibold text-gray-500 uppercase flex items-center justify-between"
            >
                <span>旋转角度</span>
                <span class="text-indigo-600 font-medium"
                    >{box.rotation ?? 0}°</span
                >
            </label>
            <input
                id="rotation-slider"
                type="range"
                min="-180"
                max="180"
                step="1"
                value={box.rotation ?? 0}
                oninput={(e) =>
                    updateBoxProp("rotation", parseInt(e.target.value))}
                class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
        </div>

        <div class="space-y-1">
            <label
                for="line-height-slider"
                class="text-xs font-semibold text-gray-500 uppercase flex items-center justify-between"
            >
                <span>行间距</span>
                <span class="text-indigo-600 font-medium"
                    >{(box.lineHeight ?? 1.4).toFixed(1)}</span
                >
            </label>
            <input
                id="line-height-slider"
                type="range"
                min="0.8"
                max="3.0"
                step="0.1"
                value={box.lineHeight ?? 1.4}
                oninput={(e) =>
                    updateBoxProp("lineHeight", parseFloat(e.target.value))}
                class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
        </div>

        <div class="space-y-1">
            <label
                for="stroke-width-slider"
                class="text-xs font-semibold text-gray-500 uppercase flex items-center justify-between"
            >
                <span>描边宽度</span>
                <span class="text-indigo-600 font-medium"
                    >{box.strokeWidth ?? 0}px</span
                >
            </label>
            <input
                id="stroke-width-slider"
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={box.strokeWidth ?? 0}
                oninput={(e) =>
                    updateBoxProp("strokeWidth", parseFloat(e.target.value))}
                class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
        </div>

        <div class="flex items-center justify-between">
            <label
                for="stroke-color-picker"
                class="text-xs font-semibold text-gray-500 uppercase flex items-center gap-2"
            >
                <ALargeSmall size={14} class="text-gray-400" />
                描边颜色
            </label>
            <input
                id="stroke-color-picker"
                type="color"
                value={box.strokeColor || "#ffffff"}
                onchange={(e) => updateBoxProp("strokeColor", e.target.value)}
                class="w-8 h-8 p-0.5 border-0 rounded-md cursor-pointer bg-white shadow-sm transition-transform hover:scale-105"
            />
        </div>

        <div class="space-y-1">
            <label
                for="font-family-select"
                class="text-xs font-semibold text-gray-500 uppercase flex items-center justify-between"
            >
                <span>字体选择</span>
                <button
                    class="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors border border-indigo-100"
                    onclick={handleFontUpload}
                    title="上传自定义字体文件 (.ttf, .otf, .woff, .woff2)"
                >
                    <Upload size={11} />
                    上传字体
                </button>
            </label>
            <select
                id="font-family-select"
                class="w-full text-sm p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white transition-colors"
                value={box.fontFamily || "inherit"}
                onchange={(e) => updateBoxProp("fontFamily", e.target.value)}
            >
                <optgroup label="系统字体">
                    <option value="inherit">系统默认</option>
                    <option value="'Microsoft YaHei', sans-serif"
                        >微软雅黑</option
                    >
                    <option value="'SimHei', sans-serif">黑体</option>
                    <option value="'SimSun', serif">宋体</option>
                    <option value="'Kaiti', serif">楷体</option>
                    <option value="'FangSong', serif">仿宋</option>
                    <option value="'Source Han Sans CN', sans-serif"
                        >思源黑体</option
                    >
                    <option value="'Source Han Serif CN', serif"
                        >思源宋体</option
                    >
                </optgroup>
                {#if customFonts.length > 0}
                    <optgroup label="自定义字体">
                        {#each customFonts as font (font.id)}
                            <option value="'{font.name}'">{font.name}</option>
                        {/each}
                    </optgroup>
                {/if}
            </select>

            {#if customFonts.length > 0}
                <div class="space-y-1 pt-1">
                    {#each customFonts as font (font.id)}
                        <div
                            class="flex items-center justify-between px-2 py-1.5 bg-gray-50 border border-gray-100 rounded-md group"
                        >
                            <div class="flex items-center gap-2 min-w-0">
                                <span
                                    class="w-5 h-5 rounded bg-indigo-100 text-indigo-600 flex items-center justify-center text-[9px] font-bold shrink-0"
                                    style="font-family: '{font.name}';"
                                >
                                    Aa
                                </span>
                                <span
                                    class="text-xs text-gray-600 truncate"
                                    title={font.fileName}>{font.name}</span
                                >
                            </div>
                            <button
                                class="p-0.5 rounded text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                                onclick={() => deleteFont(font.id)}
                                title="删除字体"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    {/each}
                </div>
            {/if}

            {#if box.fontFamily}
                <div class="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100 space-y-3 mt-2">
                    <div class="text-[11px] font-semibold text-indigo-800 flex items-center justify-between">
                        <span>当前字体标点符号微调</span>
                    </div>
                    <div class="space-y-1">
                        <label class="text-[10px] text-gray-500 flex justify-between">
                            <span>横向偏移 (X)</span>
                            <span class="text-indigo-600 font-medium">{getFontOffset(box.fontFamily).x.toFixed(2)}em</span>
                        </label>
                        <input
                            type="range"
                            min="-1.5"
                            max="1.5"
                            step="0.05"
                            value={getFontOffset(box.fontFamily).x}
                            oninput={(e) => updateFontOffset(box.fontFamily, 'x', parseFloat(e.target.value))}
                            class="w-full h-1.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                    </div>
                    <div class="space-y-1">
                        <label class="text-[10px] text-gray-500 flex justify-between">
                            <span>纵向偏移 (Y)</span>
                            <span class="text-indigo-600 font-medium">{getFontOffset(box.fontFamily).y.toFixed(2)}em</span>
                        </label>
                        <input
                            type="range"
                            min="-1.5"
                            max="1.5"
                            step="0.05"
                            value={getFontOffset(box.fontFamily).y}
                            oninput={(e) => updateFontOffset(box.fontFamily, 'y', parseFloat(e.target.value))}
                            class="w-full h-1.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                    </div>
                </div>
            {/if}
        </div>

        <div class="space-y-1">
            <label
                for="writing-mode-toggle"
                class="text-xs font-semibold text-gray-500 uppercase"
            >
                排版方向
            </label>
            <div
                id="writing-mode-toggle"
                class="flex p-1 bg-gray-100 rounded-lg gap-1"
            >
                <button
                    class="flex-1 py-1.5 rounded-md flex justify-center items-center text-sm font-medium transition-colors {box.writingMode !==
                    'vertical-rl'
                        ? 'bg-white shadow-sm text-indigo-600'
                        : 'text-gray-600 hover:bg-gray-200'}"
                    aria-label="横向排版"
                    onclick={() =>
                        updateBoxProp("writingMode", "horizontal-tb")}
                >
                    <span class="mr-1.5">横向</span>
                    <Baseline size={14} />
                </button>
                <button
                    class="flex-1 py-1.5 rounded-md flex justify-center items-center text-sm font-medium transition-colors {box.writingMode ===
                    'vertical-rl'
                        ? 'bg-white shadow-sm text-indigo-600'
                        : 'text-gray-600 hover:bg-gray-200'}"
                    aria-label="纵向排版"
                    onclick={() => updateBoxProp("writingMode", "vertical-rl")}
                >
                    <span class="mr-1.5">纵向</span>
                    <div class="rotate-90 flex items-center">
                        <Baseline size={14} />
                    </div>
                </button>
            </div>
        </div>

        <div class="space-y-3">
            <label
                for="style-color-section"
                class="text-xs font-semibold text-gray-500 uppercase"
                >颜色</label
            >

            <div class="flex items-center justify-between">
                <label
                    for="text-col-picker"
                    class="text-sm text-gray-600 flex items-center gap-2"
                >
                    <Type size={14} class="text-gray-400" /> 文本颜色
                </label>
                <input
                    id="text-col-picker"
                    type="color"
                    value={box.color}
                    onchange={(e) => updateBoxProp("color", e.target.value)}
                    class="w-8 h-8 p-0 border-0 rounded cursor-pointer"
                />
            </div>

            <div class="flex items-center justify-between">
                <label
                    for="bg-col-picker"
                    class="text-sm text-gray-600 flex items-center gap-2"
                >
                    <PaintBucket size={14} class="text-gray-400" /> 背景
                </label>
                <div class="flex items-center gap-2">
                    <button
                        class="w-6 h-6 rounded border {box.bg === 'transparent'
                            ? 'border-indigo-500 ring-1 ring-indigo-200'
                            : ' border-indigo-200'} bg-transparent"
                        onclick={() => updateBoxProp("bg", "transparent")}
                        title="透明背景"
                    ></button>
                    <input
                        id="bg-col-picker"
                        type="color"
                        value={box.bg === "transparent" ? "#ffffff" : box.bg}
                        onchange={(e) => updateBoxProp("bg", e.target.value)}
                        class="w-8 h-8 p-0 border-0 rounded cursor-pointer"
                    />
                </div>
            </div>

            <div class="flex items-center space-x-2 pt-1">
                <label
                    for="bg-opacity-input"
                    class="text-xs text-gray-500 min-w-[32px]">不透明度</label
                >
                <input
                    id="bg-opacity-input"
                    type="range"
                    min="0"
                    max="100"
                    value={box.bgOpacity ?? 100}
                    oninput={(e) =>
                        updateBoxProp("bgOpacity", parseInt(e.target.value))}
                    class="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <span class="text-xs text-gray-500 min-w-[24px] text-right"
                    >{box.bgOpacity ?? 100}%</span
                >
            </div>
        </div>

        <div class="space-y-2">
            <label
                for="horiz-align-toggle"
                class="text-xs font-semibold text-gray-500 uppercase"
            >
                水平对齐
            </label>
            <div
                id="horiz-align-toggle"
                class="flex p-1 bg-gray-100 rounded-lg gap-1"
            >
                {#each ["left", "center", "right"] as align}
                    <button
                        class="flex-1 py-1.5 rounded-md flex justify-center text-gray-600 transition-colors {box.align ===
                        align
                            ? 'bg-white shadow-sm text-indigo-600'
                            : 'hover:bg-gray-200'}"
                        onclick={() => updateBoxProp("align", align)}
                        aria-label="对齐方式: {align}"
                    >
                        {#if align === "left"}
                            <AlignLeft size={16} />
                        {:else if align === "center"}
                            <AlignCenter size={16} />
                        {:else}
                            <AlignRight size={16} />
                        {/if}
                    </button>
                {/each}
            </div>
        </div>

        <div class="space-y-2">
            <label
                for="vertical-align-toggle"
                class="text-xs font-semibold text-gray-500 uppercase"
            >
                垂直对齐
            </label>
            <div
                id="vertical-align-toggle"
                class="flex p-1 bg-gray-100 rounded-lg gap-1"
            >
                {#each [{ value: "top", label: "上" }, { value: "center", label: "中" }, { value: "bottom", label: "下" }] as va}
                    <button
                        class="flex-1 py-1.5 rounded-md flex justify-center items-center gap-1 text-gray-600 transition-colors text-sm {(box.verticalAlign ||
                            'center') === va.value
                            ? 'bg-white shadow-sm text-indigo-600'
                            : 'hover:bg-gray-200'}"
                        onclick={() => updateBoxProp("verticalAlign", va.value)}
                        aria-label="垂直对齐: {va.label}"
                    >
                        {#if va.value === "top"}
                            <AlignStartVertical size={16} />
                        {:else if va.value === "center"}
                            <AlignCenterVertical size={16} />
                        {:else}
                            <AlignEndVertical size={16} />
                        {/if}
                        {va.label}
                    </button>
                {/each}
            </div>
        </div>

        <hr class="border-gray-100" />

        <div
            class="space-y-3 text-xs text-gray-500 bg-gray-50 p-3 rounded-lg border border-gray-100 animate-in fade-in transition-all"
        >
            <div class="flex justify-between items-center mb-1">
                <span
                    class="font-semibold text-gray-600 flex items-center gap-1.5"
                    ><Maximize2 size={12} /> 位置与大小</span
                >
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div class="flex items-center gap-1.5">
                    <span class="w-4">X:</span>
                    <input
                        type="number"
                        class="w-full bg-white border border-gray-200 rounded px-1.5 py-1 text-gray-700 outline-none focus:border-indigo-500"
                        value={Math.round(box.x || 0)}
                        oninput={(e) =>
                            updateBoxProp("x", parseInt(e.target.value) || 0)}
                    />
                </div>
                <div class="flex items-center gap-1.5">
                    <span class="w-4">Y:</span>
                    <input
                        type="number"
                        class="w-full bg-white border border-gray-200 rounded px-1.5 py-1 text-gray-700 outline-none focus:border-indigo-500"
                        value={Math.round(box.y || 0)}
                        oninput={(e) =>
                            updateBoxProp("y", parseInt(e.target.value) || 0)}
                    />
                </div>
                <div class="flex items-center gap-1.5">
                    <span class="w-4">宽:</span>
                    <input
                        type="number"
                        class="w-full bg-white border border-gray-200 rounded px-1.5 py-1 text-gray-700 outline-none focus:border-indigo-500"
                        value={Math.round(box.width || 0)}
                        oninput={(e) =>
                            updateBoxProp(
                                "width",
                                Math.max(20, parseInt(e.target.value) || 20),
                            )}
                    />
                </div>
                <div class="flex items-center gap-1.5">
                    <span class="w-4">高:</span>
                    <input
                        type="number"
                        class="w-full bg-white border border-gray-200 rounded px-1.5 py-1 text-gray-700 outline-none focus:border-indigo-500"
                        value={Math.round(box.height || 0)}
                        oninput={(e) =>
                            updateBoxProp(
                                "height",
                                Math.max(20, parseInt(e.target.value) || 20),
                            )}
                    />
                </div>
            </div>
        </div>

        <div class="pt-2">
            <button
                class="w-full py-2 px-4 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 rounded-lg flex items-center justify-center gap-2 font-medium text-sm animate-in fade-in transition-all"
                onclick={onDelete}
            >
                <Trash2 size={16} />
                删除文本框
            </button>
        </div>
    {/if}
</div>
