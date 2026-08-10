<script>
    import { Trash2 } from "lucide-svelte";

    let { pages, activePageIndex, onSelectPage, onDeletePage } = $props();
</script>

{#if !pages || pages.length === 0}
    <div class="text-center text-gray-400 mt-10 text-sm">
        尚未上传页面。<br />点击“上传页面”开始。
    </div>
{/if}

{#if pages}
    {#each pages as page, index}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="relative group rounded-lg border-2 cursor-pointer overflow-hidden transition-all {index ===
            activePageIndex
                ? 'border-indigo-500 shadow-md ring-2 ring-indigo-200 scale-[1.02]'
                : 'border-transparent hover:border-gray-300 shadow-sm'}"
            onclick={() => onSelectPage(index)}
        >
            <!-- Thumbnail wrapper -->
            <div
                class="aspect-[1/1.4] bg-white flex items-center justify-center relative"
            >
                <img
                    src={page.imageUrl}
                    alt="页面 {index + 1}"
                    class="max-w-full max-h-full object-contain"
                />

                <!-- Page Number Badge -->
                <div
                    class="absolute top-2 left-2 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-md shadow-sm"
                >
                    {index + 1}
                </div>

                <!-- Delete Button overlay -->
                <button
                    class="absolute top-2 right-2 bg-red-500/90 text-white p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-sm"
                    onclick={(e) => {
                        e.stopPropagation();
                        onDeletePage(index);
                    }}
                    title="删除页面"
                >
                    <Trash2 size={14} />
                </button>

                {#if page.items && page.items.length > 0}
                    <div
                        class="absolute bottom-2 right-2 bg-indigo-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm shadow-sm backdrop-blur-sm"
                    >
                        {page.items.length} 个框
                    </div>
                {/if}
            </div>
        </div>
    {/each}
{/if}
