<script>
    import { Type, Brush } from "lucide-svelte";
    import ToolbarText from "./ToolbarText.svelte";
    import ToolbarInpaint from "./ToolbarInpaint.svelte";

    let {
        activeItem,
        activeTab,
        onTabChange,
        onUpdate,
        onDelete,
        isErasing,
        brushSize,
        showMask,
        maskOpacity,
        onUpdateMaskMode,
        onUpdateBrushSize,
        onToggleMask,
        onUpdateMaskOpacity,
        isAiMode,
        isStampMode,
        maskColor,
        onUpdateMaskColor,
        onApplyPresetToPage,
        onApplyPresetToAll,
    } = $props();
</script>

<aside
    class="w-72 bg-gray-50 border-l border-gray-200 flex flex-col h-full shadow-inner z-20"
>
    <div class="flex border-b border-gray-200 bg-white">
        <button
            class="flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 {activeTab ===
            'text'
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30'
                : 'text-gray-500 hover:text-gray-700 bg-white'}"
            onclick={() => onTabChange("text")}
        >
            <Type size={16} />
            文本属性
        </button>
        <button
            class="flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 {activeTab ===
            'inpaint'
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30'
                : 'text-gray-500 hover:text-gray-700 bg-white'}"
            onclick={() => onTabChange("inpaint")}
        >
            <Brush size={16} />
            图像修复
        </button>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-6 hide-scrollbar">
        {#if activeTab === "inpaint"}
            <ToolbarInpaint
                {isErasing}
                {brushSize}
                {showMask}
                {maskOpacity}
                {onUpdateMaskMode}
                {onUpdateBrushSize}
                {onToggleMask}
                {onUpdateMaskOpacity}
                {isAiMode}
                {isStampMode}
                {maskColor}
                {onUpdateMaskColor}
            />
        {:else if activeTab === "text"}
            <ToolbarText
                {activeItem}
                {onUpdate}
                {onDelete}
                {onApplyPresetToPage}
                {onApplyPresetToAll}
            />
        {/if}
    </div>
</aside>
