<script>
    import {
        Download,
        UploadCloud,
        RefreshCw,
        Settings,
        Brush,
        Languages,
        ScanText,
        FileSearch,
        Layers,
        Save,
        FolderOpen,
    } from "lucide-svelte";

    let {
        onUpload,
        onExport,
        isExporting,
        onAutoDetect,
        isDetecting,
        onSettings,
        onTranslation,
        onRecognizeAll,
        isRecognizing,
        onOcrPage,
        isOcring,
        onBatchOcr,
        isBatchOcring,
        onSave,
        onLoad,
    } = $props();
</script>

<header
    class="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 z-10 relative"
>
    <div class="flex items-center gap-4">
        <h1 class="text-xl font-bold text-gray-800">漫画翻译工作室</h1>
    </div>

    <div class="flex items-center gap-3">
        <button
            onclick={onSettings}
            class="flex items-center gap-2 px-3 py-2 text-gray-500 rounded-md hover:bg-gray-100 transition-colors cursor-pointer text-sm font-medium"
            title="API 设置"
        >
            <Settings size={18} />
        </button>

        <button
            onclick={onAutoDetect}
            disabled={isDetecting}
            class="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
            <RefreshCw size={16} class={isDetecting ? "animate-spin" : ""} />
            {isDetecting ? "正在创建中..." : "批量创建遮罩"}
        </button>

        <button
            onclick={onOcrPage}
            disabled={isOcring}
            class="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-600 rounded-md hover:bg-amber-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
            <FileSearch size={16} class={isOcring ? "animate-pulse" : ""} />
            {isOcring ? "识别中..." : "全图OCR"}
        </button>

        <button
            onclick={onBatchOcr}
            disabled={isBatchOcring}
            class="flex items-center gap-2 px-4 py-2 bg-teal-50 text-teal-600 rounded-md hover:bg-teal-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
            <Layers size={16} class={isBatchOcring ? "animate-pulse" : ""} />
            {isBatchOcring ? "批量识别中..." : "批量OCR"}
        </button>

        <button
            onclick={onRecognizeAll}
            disabled={isRecognizing}
            class="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-600 rounded-md hover:bg-purple-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
            <ScanText size={16} class={isRecognizing ? "animate-pulse" : ""} />
            {isRecognizing ? "识别中..." : "一键识别"}
        </button>

        <button
            onclick={onTranslation}
            class="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 rounded-md hover:bg-green-100 transition-colors cursor-pointer text-sm font-medium"
        >
            <Languages size={16} />
            批量机器翻译
        </button>

        <button
            onclick={onUpload}
            class="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors cursor-pointer text-sm font-medium"
        >
            <UploadCloud size={16} />
            上传页面
        </button>

        <div class="w-px h-6 bg-gray-300 mx-1"></div>

        <button
            onclick={onSave}
            class="flex items-center gap-2 px-4 py-2 bg-cyan-50 text-cyan-600 rounded-md hover:bg-cyan-100 transition-colors cursor-pointer text-sm font-medium"
            title="保存项目到文件"
        >
            <Save size={16} />
            存档
        </button>

        <button
            onclick={onLoad}
            class="flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-600 rounded-md hover:bg-orange-100 transition-colors cursor-pointer text-sm font-medium"
            title="从文件加载项目"
        >
            <FolderOpen size={16} />
            读档
        </button>

        <div class="w-px h-6 bg-gray-300 mx-1"></div>

        <button
            onclick={onExport}
            disabled={isExporting}
            class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm"
        >
            <Download size={16} />
            {isExporting ? "导出中..." : "导出当前"}
        </button>
    </div>
</header>
