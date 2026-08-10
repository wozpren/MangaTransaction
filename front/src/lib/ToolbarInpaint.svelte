<script>
    import { Brush, Eraser, Maximize2, Stamp, Palette } from "lucide-svelte";

    let {
        showMask,
        onToggleMask,
        isErasing,
        isAiMode,
        isStampMode,
        maskColor,
        onUpdateMaskMode,
        onUpdateMaskColor,
        brushSize,
        onUpdateBrushSize,
    } = $props();
</script>

<div class="space-y-2">
    <div class="flex items-center justify-between">
        <label
            for="mask-toggle"
            class="text-xs font-semibold text-gray-500 uppercase"
        >
            显示修复遮罩
        </label>
        <button
            id="mask-toggle"
            aria-label="切换遮罩显示"
            class="w-10 h-5 rounded-full relative transition-colors {showMask
                ? 'bg-indigo-600'
                : 'bg-gray-300'}"
            onclick={onToggleMask}
        >
            <div
                class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm {showMask
                    ? 'left-[22px]'
                    : 'left-0.5'}"
            ></div>
        </button>
    </div>
</div>

<hr class="border-gray-100" />

<div class="space-y-2">
    <label
        for="brush-mode-toggle"
        class="text-xs font-semibold text-gray-500 uppercase">画笔工具</label
    >
    <div id="brush-mode-toggle" class="grid grid-cols-2 p-1 bg-gray-100 rounded-lg gap-1">
        <button
            class="py-1.5 rounded-md flex justify-center items-center text-gray-600 transition-colors {isErasing &&
            !isAiMode
                ? 'bg-white shadow-sm text-indigo-600'
                : 'hover:bg-gray-200'}"
            onclick={() => onUpdateMaskMode("erase")}
        >
            <Eraser size={16} />
            <span class="ml-2 text-sm whitespace-nowrap">橡皮擦</span>
        </button>
        <button
            class="py-1.5 rounded-md flex justify-center items-center text-gray-600 transition-colors {!isErasing &&
            !isAiMode &&
            !isStampMode
                ? 'bg-white shadow-sm text-indigo-600'
                : 'hover:bg-gray-200'}"
            onclick={() => onUpdateMaskMode("draw")}
        >
            <Brush size={16} />
            <span class="ml-2 text-sm whitespace-nowrap">涂抹</span>
        </button>
        <button
            class="py-1.5 rounded-md flex justify-center items-center text-gray-600 transition-colors {isAiMode
                ? 'bg-white shadow-sm text-indigo-600'
                : 'hover:bg-gray-200'}"
            onclick={() => onUpdateMaskMode("ai")}
        >
            <Maximize2 size={16} />
            <span class="ml-2 text-sm whitespace-nowrap">AI选区</span>
        </button>
        <button
            class="py-1.5 rounded-md flex justify-center items-center text-gray-600 transition-colors {isStampMode
                ? 'bg-white shadow-sm text-indigo-600'
                : 'hover:bg-gray-200'}"
            onclick={() => onUpdateMaskMode("stamp")}
            title="仿制图章"
        >
            <Stamp size={16} />
            <span class="ml-2 text-sm whitespace-nowrap">图章</span>
        </button>
    </div>
</div>

<div class="flex items-center justify-between">
    <label
        for="mask-color-picker"
        class="text-xs font-semibold text-gray-500 uppercase flex items-center gap-2"
    >
        <Palette size={14} class="text-gray-400" />
        涂抹颜色
    </label>
    <input
        id="mask-color-picker"
        type="color"
        value={maskColor || "#ffffff"}
        onchange={(e) => onUpdateMaskColor(e.target.value)}
        class="w-8 h-8 p-0.5 border-0 rounded-md cursor-pointer bg-white shadow-sm transition-transform hover:scale-105"
    />
</div>

<div class="space-y-2">
    <label
        for="brush-size-slider"
        class="text-xs font-semibold text-gray-500 uppercase flex items-center justify-between"
    >
        <span>画笔大小</span>
        <span class="text-indigo-600 font-medium">{brushSize}px</span>
    </label>
    <input
        id="brush-size-slider"
        type="range"
        min="1"
        max="100"
        value={brushSize}
        oninput={(e) => onUpdateBrushSize(parseInt(e.target.value))}
        class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
    />
</div>

<hr class="border-gray-100" />
<div
    class="text-xs leading-relaxed bg-blue-50 p-3 rounded-lg border border-blue-100 text-blue-700"
>
    <p><strong>提示:</strong></p>
    <ul class="list-disc ml-4 space-y-1 mt-1 font-medium">
        <li>你可以在原图上进行涂抹修复遮罩层。</li>
        <li>
            按住 <strong>空格</strong> 拖拽画布可进行平移。
        </li>
        <li>滚动鼠标滚轮可以进行缩放。</li>
        <li>使用 <strong>仿制图章</strong> 时，按住 <strong>Alt</strong> 键点击选择源点。</li>
    </ul>
</div>
