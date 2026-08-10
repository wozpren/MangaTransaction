<script>
    import { X, Copy, Check } from "lucide-svelte";
    import { showToast } from "./toast.js";

    let { pages, onClose } = $props();

    let promptPrefix =
        "请将以下原文翻译为中文。请以通顺的语句翻译，保持每行的顺序和行数完全对应，译文只输出结果即可。\n\n";

    let generatedText = $state("");
    let pastedText = $state("");
    let copied = $state(false);

    let textItemsMapping = [];

    // Generate text on mount
    $effect(() => {
        let text = "";
        textItemsMapping = [];

        pages.forEach((page, pIndex) => {
            if (page.items) {
                page.items.forEach((item, iIndex) => {
                    const originalText = (item.originalText || "").trim();
                    const singleLineText = originalText.replace(/\n/g, " ");
                    if (singleLineText) {
                        text += singleLineText + "\n\n";
                        textItemsMapping.push({ pIndex, iIndex });
                    }
                });
            }
        });
        generatedText = promptPrefix + text;
    });

    async function handleCopy() {
        await navigator.clipboard.writeText(generatedText);
        copied = true;
        setTimeout(() => (copied = false), 2000);
    }

    function applyTranslation() {
        if (!pastedText.trim()) return;

        const translatedLines = pastedText
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line);

        if (translatedLines.length !== textItemsMapping.length) {
            showToast(
                `警告：原文共 ${textItemsMapping.length} 行，但译文有 ${translatedLines.length} 行，可能无法完全对应！将尽可能按顺序匹配。`,
            );
        }

        let count = 0;
        const length = Math.min(
            translatedLines.length,
            textItemsMapping.length,
        );

        for (let i = 0; i < length; i++) {
            const { pIndex, iIndex } = textItemsMapping[i];
            const translation = translatedLines[i];

            if (
                pages[pIndex] &&
                pages[pIndex].items &&
                pages[pIndex].items[iIndex]
            ) {
                pages[pIndex].items[iIndex].text = translation;
                count++;
            }
        }

        showToast(`成功导入 ${count} 条译文！`);
        onClose();
    }
</script>

<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div
        class="bg-white rounded-lg shadow-xl w-[90vw] h-[90vh] p-6 flex flex-col"
    >
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold">批量机器翻译</h2>
            <button onclick={onClose} class="text-gray-500 hover:text-gray-700">
                <X size={24} />
            </button>
        </div>

        <div class="flex-1 overflow-hidden flex gap-4 min-h-0">
            <!-- Left: Generated prompt -->
            <div class="flex-1 flex flex-col shadow-sm border rounded-md">
                <div
                    class="bg-gray-50 px-3 py-2 border-b flex justify-between items-center"
                >
                    <span class="text-sm font-medium text-gray-700"
                        >复制发送给 AI 的提示词与原文</span
                    >
                    <button
                        onclick={handleCopy}
                        class="flex items-center gap-1 text-sm bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 transition-colors"
                    >
                        {#if copied}
                            <Check size={14} /> 已复制
                        {:else}
                            <Copy size={14} /> 复制全部
                        {/if}
                    </button>
                </div>
                <textarea
                    class="flex-1 w-full p-3 resize-none outline-none font-mono text-sm leading-relaxed"
                    bind:value={generatedText}
                ></textarea>
            </div>

            <!-- Right: Pasted translation -->
            <div class="flex-1 flex flex-col shadow-sm border rounded-md">
                <div
                    class="bg-gray-50 px-3 py-2 border-b flex items-center h-13"
                >
                    <span class="text-sm font-medium text-gray-700"
                        >在此粘贴 AI 翻译后的结果</span
                    >
                </div>
                <textarea
                    class="flex-1 w-full p-3 resize-none outline-none font-mono text-sm leading-relaxed"
                    placeholder="粘贴返回的文本，确保按行对应..."
                    bind:value={pastedText}
                ></textarea>
            </div>
        </div>

        <div class="mt-4 flex justify-end gap-3 pt-2">
            <button
                onclick={onClose}
                class="px-5 py-2 border rounded-md hover:bg-gray-50 transition-colors"
            >
                取消
            </button>
            <button
                onclick={applyTranslation}
                class="px-5 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors shadow-sm"
            >
                一键应用译文
            </button>
        </div>
    </div>
</div>
