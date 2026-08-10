<script>
    import { FileImage, SlidersHorizontal } from "lucide-svelte";
    import SidebarPages from "./SidebarPages.svelte";
    import SidebarProperties from "./SidebarProperties.svelte";

    let {
        pages,
        activePageIndex,
        activeBoxId,
        onSelectPage,
        onDeletePage,
        onSelectBox,
        onUpdateItem,
    } = $props();

    let activeTab = $state("pages"); // "pages" | "properties"
    let activePage = $derived(pages ? pages[activePageIndex] : null);
</script>

<aside
    class="w-72 bg-gray-50 border-r border-gray-200 flex flex-col h-full overflow-hidden shadow-inner"
>
    <div class="flex border-b border-gray-200 bg-white">
        <button
            class="flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 {activeTab ===
            'pages'
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30'
                : 'text-gray-500 hover:text-gray-700 bg-white'}"
            onclick={() => (activeTab = "pages")}
        >
            <FileImage size={16} />
            页面 ({pages ? pages.length : 0})
        </button>
        <button
            class="flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 {activeTab ===
            'properties'
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30'
                : 'text-gray-500 hover:text-gray-700 bg-white'}"
            onclick={() => (activeTab = "properties")}
        >
            <SlidersHorizontal size={16} />
            属性
        </button>
    </div>

    <div
        class="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar"
        style:display={activeTab === "pages" ? "block" : "none"}
    >
        <SidebarPages {pages} {activePageIndex} {onSelectPage} {onDeletePage} />
    </div>
    <div
        class="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar"
        style:display={activeTab === "properties" ? "block" : "none"}
    >
        <SidebarProperties
            {activePage}
            {activePageIndex}
            {activeBoxId}
            {onSelectBox}
            {onUpdateItem}
        />
    </div>
</aside>
