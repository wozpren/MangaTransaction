<script>
    import { apiSettings } from "./api.js";
    import { showToast } from "./toast.js";

    let {
        activePage,
        activePageIndex,
        activeBoxId,
        onSelectBox,
        onUpdateItem,
    } = $props();

    let recognizingBoxId = $state(null);

    async function handleRecognizeText(boxo) {
        if (recognizingBoxId) return;
        recognizingBoxId = boxo.id;
        const box = boxo.box;
        try {
            const mangaOcrUrl = apiSettings.mangaOcrUrl;
            const response = await fetch(`${mangaOcrUrl}/ocr/crop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: activePage.imageUrl,
                    x: box.x,
                    y: box.y,
                    width: box.width,
                    height: box.height,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            boxo.originalText = data.text.trim();
            const updatedItem = { ...boxo };
            onUpdateItem(updatedItem, false);
        } catch (e) {
            console.error("OCR failed:", e);
            showToast("识别失败: " + e.message + "，请确保 OCR 服务已启动");
        } finally {
            recognizingBoxId = null;
        }
    }
</script>

{#if activePage}
    <div class="space-y-4 pb-10">
        <h3 class="text-sm font-bold text-gray-700 flex items-center gap-2">
            <span class="w-1.5 h-4 bg-indigo-500 rounded-full inline-block"
            ></span>
            页面 {activePageIndex + 1} 的文本框 ({activePage.items
                ? activePage.items.length
                : 0})
        </h3>

        {#if !activePage.items || activePage.items.length === 0}
            <div
                class="text-center text-gray-400 mt-6 text-sm bg-gray-50 p-4 rounded-lg border border-dashed border-gray-300"
            >
                当前页面没有文本框。<br />请在绘图区框选或自动检测。
            </div>
        {:else}
            {#each activePage.items as box, index}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class="border rounded-md text-sm cursor-pointer transition-colors shadow-sm {activeBoxId ===
                    box.id
                        ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-400'
                        : 'border-gray-200 hover:border-gray-300 bg-white'}"
                    onclick={() => onSelectBox(box.id)}
                >
                    <div
                        class="flex justify-between items-center bg-gray-50/80 px-3 py-2 border-b border-gray-100 rounded-t-md"
                    >
                        <span class="font-semibold text-gray-600 text-xs"
                            >文本框 {index + 1}</span
                        >
                        <div class="flex gap-1">
                            {#if box.originalText}
                                <span
                                    class="bg-blue-100/80 text-blue-700 text-[10px] px-1.5 py-0.5 rounded shadow-sm"
                                    >已识别</span
                                >
                            {/if}
                            {#if box.text}
                                <span
                                    class="bg-green-100/80 text-green-700 text-[10px] px-1.5 py-0.5 rounded shadow-sm"
                                    >已翻译</span
                                >
                            {/if}
                        </div>
                    </div>

                    <div class="p-3 space-y-3">
                        <div>
                            <div class="flex justify-between items-center mb-1">
                                <label
                                    for="original-{box.id}"
                                    class="text-xs font-medium text-gray-500"
                                    >原文</label
                                >
                                <button
                                    class="text-xs text-indigo-500 hover:text-indigo-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={recognizingBoxId === box.id}
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        handleRecognizeText(box);
                                    }}
                                >
                                    {recognizingBoxId === box.id
                                        ? "识别中..."
                                        : "自动识别"}
                                </button>
                            </div>
                            <textarea
                                id="original-{box.id}"
                                class="w-full text-xs p-2.5 border rounded-md border-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none resize-y bg-gray-50/50 hover:bg-white transition-colors"
                                placeholder="未识别到原文..."
                                rows="2"
                                value={box.originalText || ""}
                                oninput={(e) => {
                                    const updatedItem = {
                                        ...box,
                                        originalText: e.target.value,
                                    };
                                    onUpdateItem(updatedItem, false);
                                }}
                                onclick={(e) => {
                                    e.stopPropagation();
                                    onSelectBox(box.id);
                                }}
                            ></textarea>
                        </div>

                        <div>
                            <div class="flex justify-between items-center mb-1">
                                <label
                                    for="translated-{box.id}"
                                    class="text-xs font-medium text-gray-500"
                                    >翻译 (将覆盖显示)</label
                                >
                            </div>
                            <textarea
                                id="translated-{box.id}"
                                class="w-full text-xs p-2.5 border rounded-md border-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none resize-y bg-gray-50/50 hover:bg-white transition-colors"
                                placeholder="输入翻译文本..."
                                rows="3"
                                value={box.text || ""}
                                oninput={(e) => {
                                    const updatedItem = {
                                        ...box,
                                        text: e.target.value,
                                    };
                                    onUpdateItem(updatedItem, false);
                                }}
                                onclick={(e) => {
                                    e.stopPropagation();
                                    onSelectBox(box.id);
                                }}
                            ></textarea>
                        </div>
                    </div>
                </div>
            {/each}
        {/if}
    </div>
{:else}
    <div class="text-center text-gray-400 mt-10 text-sm">未选择页面。</div>
{/if}
