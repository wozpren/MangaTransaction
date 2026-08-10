<script>
    import Header from "$lib/Header.svelte";
    import Sidebar from "$lib/Sidebar.svelte";
    import Workspace from "$lib/Workspace.svelte";
    import Toolbar from "$lib/Toolbar.svelte";
    import SettingsModal from "$lib/SettingsModal.svelte";
    import TranslationModal from "$lib/TranslationModal.svelte";
    import { toPng } from "html-to-image";
    import { processComicPage, apiSettings } from "$lib/api.js";
    import { recognizeText, ocrFullPage, ocrResultToItems } from "$lib/ocr.js";
    import { tick } from "svelte";
    import { showToast } from "$lib/toast.js";

    // State
    let pages = $state([]);
    let activePageIndex = $state(0);
    let activeBoxId = $state(null);
    let isExporting = $state(false);
    let isDetecting = $state(false);
    let isRecognizing = $state(false);
    let isOcring = $state(false);
    let isBatchOcring = $state(false);
    let showSettings = $state(false);
    let showTranslation = $state(false);
    let showMask = $state(false);
    let maskOpacity = $state(1);
    let maskColor = $state("#ffffff");

    let activeTab = $state("text"); // "text" | "inpaint"

    // Mask Brush State
    let isErasing = $state(false);
    let isAiMode = $state(false);
    let isStampMode = $state(false);
    let brushSize = $state(20);

    // Workspace Reference for Export
    let workspaceRef = $state();

    // Derived
    let activePage = $derived(pages[activePageIndex]);
    let activeItem = $derived(
        activePage?.items.find((box) => box.id === activeBoxId),
    );

    // Handlers
    function handleTabChange(tab) {
        activeTab = tab;
        if (tab === "inpaint") {
            showMask = true;
            activeBoxId = null;
        } else if (tab === "text") {
            showMask = false;
        }
    }

    async function processFiles(files) {
        const imageFiles = files
            .filter((file) => file.type.startsWith("image/"))
            .sort((a, b) =>
                a.name.localeCompare(b.name, undefined, {
                    numeric: true,
                    sensitivity: "base",
                }),
            );

        const newPages = await Promise.all(
            imageFiles.map((file) => {
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        resolve({
                            id: crypto.randomUUID(),
                            fileName: file.name,
                            imageUrl: event.target.result,
                            items: [],
                        });
                    };
                    reader.readAsDataURL(file);
                });
            }),
        );

        pages.push(...newPages);
    }

    function handleUpload() {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.accept = "image/png, image/jpeg, image/webp";

        input.onchange = async (e) => {
            const files = Array.from(e.target.files);
            processFiles(files);
        };

        input.click();
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();

        let files = [];
        if (e.dataTransfer.items) {
            files = Array.from(e.dataTransfer.items)
                .filter((box) => box.kind === "file")
                .map((box) => box.getAsFile());
        } else {
            files = Array.from(e.dataTransfer.files);
        }
        processFiles(files);
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    async function handleAutoDetect() {
        if (isDetecting || pages.length === 0) return;

        try {
            isDetecting = true;

            for (const page of pages) {
                // Skip if page already has items
                if (page.items && page.items.length > 0) continue;

                // Detect via WebGPU ONNX — create text boxes + masks
                const { boxes, maskBase64 } = await processComicPage(
                    page.imageUrl,
                );

                // 生成文本框
                if (boxes && boxes.length > 0) {
                    page.items = [...(page.items || []), ...boxes];
                    console.log(
                        `Created ${boxes.length} text boxes for ${page.fileName}`,
                    );
                }

                // 生成遮罩
                if (maskBase64) {
                    page.maskImageUrl = maskBase64;
                    console.log(
                        `Mask generated for ${page.fileName}`,
                    );
                }
            }
        } catch (e) {
            console.error("批量检测失败:", e);
            showToast("批量检测失败，请检查控制台日志。");
        } finally {
            isDetecting = false;
        }
    }

    async function handleOcrPage() {
        if (isOcring || !activePage) return;

        try {
            isOcring = true;
            const mangaOcrUrl = apiSettings.mangaOcrUrl;

            // 如果没有文本框，先通过检测模型生成
            if (!activePage.items || activePage.items.length === 0) {
                const { boxes, maskBase64 } = await processComicPage(activePage.imageUrl);
                if (boxes && boxes.length > 0) {
                    activePage.items = [...boxes];
                }
                if (maskBase64) {
                    activePage.maskImageUrl = maskBase64;
                }
            }

            // 收集需要 OCR 的文本框
            const boxesNeedOcr = (activePage.items || []).filter(box => !box.originalText);
            if (boxesNeedOcr.length === 0) {
                showToast("所有文本框已识别完毕");
                return;
            }

            // 发送框和图片到 manga-ocr 批量识别
            const response = await fetch(`${mangaOcrUrl}/ocr/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: activePage.imageUrl,
                    boxes: boxesNeedOcr.map(box => ({
                        id: box.id,
                        x: box.box.x,
                        y: box.box.y,
                        width: box.box.width,
                        height: box.box.height,
                    })),
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            for (const result of data.results) {
                const item = activePage.items.find(b => b.id === result.id);
                if (item && result.text) {
                    item.originalText = result.text.trim();
                }
            }

            console.log(`[manga-ocr] ${activePage.fileName}: 识别了 ${data.results.length} 个框，耗时 ${data.elapsed_ms}ms`);
        } catch (e) {
            console.error("OCR失败:", e);
            showToast("OCR失败: " + e.message + "，请确保 OCR 服务已启动");
        } finally {
            isOcring = false;
        }
    }

    async function handleBatchOcr() {
        if (isBatchOcring || pages.length === 0) return;

        try {
            isBatchOcring = true;
            const mangaOcrUrl = apiSettings.mangaOcrUrl;

            for (const page of pages) {
                try {
                    // 如果没有文本框，先检测
                    if (!page.items || page.items.length === 0) {
                        const { boxes, maskBase64 } = await processComicPage(page.imageUrl);
                        if (boxes && boxes.length > 0) {
                            page.items = [...boxes];
                        }
                        if (maskBase64) {
                            page.maskImageUrl = maskBase64;
                        }
                    }

                    // 收集需要 OCR 的文本框
                    const boxesNeedOcr = (page.items || []).filter(box => !box.originalText);
                    if (boxesNeedOcr.length === 0) continue;

                    // 发送到 manga-ocr 批量识别
                    const response = await fetch(`${mangaOcrUrl}/ocr/batch`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            image: page.imageUrl,
                            boxes: boxesNeedOcr.map(box => ({
                                id: box.id,
                                x: box.box.x,
                                y: box.box.y,
                                width: box.box.width,
                                height: box.box.height,
                            })),
                        }),
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    const data = await response.json();
                    for (const result of data.results) {
                        const item = page.items.find(b => b.id === result.id);
                        if (item && result.text) {
                            item.originalText = result.text.trim();
                        }
                    }

                    console.log(`[manga-ocr] ${page.fileName}: 识别了 ${data.results.length} 个框，耗时 ${data.elapsed_ms}ms`);
                } catch (e) {
                    console.error(`OCR failed for ${page.fileName}:`, e);
                }
            }
        } catch (e) {
            console.error("批量OCR失败:", e);
            showToast("批量OCR失败: " + e.message);
        } finally {
            isBatchOcring = false;
        }
    }

    async function handleRecognizeAll() {
        if (isRecognizing || pages.length === 0) return;
        try {
            isRecognizing = true;
            const mangaOcrUrl = apiSettings.mangaOcrUrl;

            for (const page of pages) {
                if (!page.items || page.items.length === 0) continue;

                // 收集需要 OCR 的文本框
                const boxesNeedOcr = page.items.filter(box => !box.originalText);
                if (boxesNeedOcr.length === 0) continue;

                // 使用本地 manga-ocr 批量接口
                try {
                    const response = await fetch(`${mangaOcrUrl}/ocr/batch`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            image: page.imageUrl,
                            boxes: boxesNeedOcr.map(box => ({
                                id: box.id,
                                x: box.box.x,
                                y: box.box.y,
                                width: box.box.width,
                                height: box.box.height,
                            })),
                        }),
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    const data = await response.json();
                    // 将识别结果填入对应的文本框
                    for (const result of data.results) {
                        const item = page.items.find(b => b.id === result.id);
                        if (item && result.text) {
                            item.originalText = result.text.trim();
                        }
                    }
                    console.log(`[manga-ocr] ${page.fileName}: 识别了 ${data.results.length} 个框，耗时 ${data.elapsed_ms}ms`);
                } catch (e) {
                    console.error(`manga-ocr batch failed for ${page.fileName}:`, e);
                    showToast(`manga-ocr 识别失败: ${e.message}，请确保 OCR 服务已启动`);
                }
            }
        } catch (e) {
            console.error("Batch OCR failed:", e);
            showToast("一键识别过程出错: " + e.message);
        } finally {
            isRecognizing = false;
        }
    }

    async function handleExport() {
        if (!activePage || !workspaceRef) return;

        try {
            isExporting = true;
            // Deselect active box to hide resize handles before capturing
            let prevBoxId = activeBoxId;
            let prevShowMask = showMask;
            activeBoxId = null;
            showMask = false;

            // Wait for DOM to update
            await tick();
            await new Promise((r) => setTimeout(r, 100));

            // Capture the workspace container (which is inside workspaceRef)
            // It has the class .shadow-2xl which wraps the image and items
            const targetElement = workspaceRef.querySelector(".transform-gpu");

            if (targetElement) {
                // 1. 获取原始的 transform 样式
                const style = window.getComputedStyle(targetElement);
                const transformValue = style.transform;
                const transformOrigin = style.transformOrigin;

                // 2. 临时移除 transform 样式（让它变回正常位置）
                targetElement.style.transform = "none";
                targetElement.style.left = "0";
                targetElement.style.top = "0";
                targetElement.style.transformOrigin = "0 0";

                // 3. 强制浏览器重绘（关键步骤，必须等待）
                // 这一步是为了让浏览器重新计算元素在页面上的真实位置
                await new Promise((resolve) => {
                    requestAnimationFrame(resolve);
                });

                // 4. 使用 html-to-image 截图
                // 此时元素在页面上的位置是正确的，截图就会包含左上角的内容
                const dataUrl = await toPng(targetElement, {
                    pixelRatio: 1, // 控制分辨率
                    backgroundColor: null,
                    filter: (node) => {
                        const isBadNode = node.tagName === "IFRAME";
                        return !isBadNode;
                    },
                });

                // 5. 恢复 transform 样式
                targetElement.style.transform = transformValue;
                targetElement.style.transformOrigin = transformOrigin;

                // Create download link
                const link = document.createElement("a");
                link.download = `translated_${activePage.fileName.split(".")[0]}.png`;
                link.href = dataUrl;
                link.click();
            }

            activeBoxId = prevBoxId; // Restore selection
            showMask = prevShowMask; // Restore mask visibility
        } catch (error) {
            console.error("Export failed:", error);
            showToast("Failed to export image.");
        } finally {
            isExporting = false;
        }
    }

    function selectPage(index) {
        if (index >= 0 && index < pages.length) {
            activePageIndex = index;
            activeBoxId = null; // Reset selection on page change
        }
    }

    function deletePage(index) {
        pages.splice(index, 1);
        if (activePageIndex >= pages.length) {
            activePageIndex = Math.max(0, pages.length - 1);
        }
        activeBoxId = null;
    }

    function updateItem(updatedItem, isNew = false) {
        if (!activePage) return;

        const boxIndex = activePage.items.findIndex(
            (box) => box.id === updatedItem.id,
        );
        if (boxIndex >= 0) {
            activePage.items[boxIndex] = updatedItem;
        } else if (isNew) {
            activePage.items.push(updatedItem);
            activeBoxId = updatedItem.id; // Auto-select newly drawn box
        }
    }

    function deleteItem() {
        if (!activePage || !activeBoxId) return;
        activePage.items = activePage.items.filter(
            (box) => box.id !== activeBoxId,
        );
        activeBoxId = null;
    }

    function applyPresetToBox(boxInstance, preset) {
        return {
            ...boxInstance,
            box: {
                ...boxInstance.box,
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
            }
        };
    }

    function applyPresetToPage(preset) {
        if (!activePage) return;
        activePage.items = (activePage.items || []).map(box => applyPresetToBox(box, preset));
        pages = [...pages]; // trigger reactivity
    }

    function applyPresetToAll(preset) {
        pages = pages.map(page => ({
            ...page,
            items: (page.items || []).map(box => applyPresetToBox(box, preset))
        }));
    }

    function handleSave() {
        if (pages.length === 0) {
            showToast("没有可保存的页面");
            return;
        }

        try {
            const saveData = {
                version: 1,
                savedAt: new Date().toISOString(),
                pages: pages.map(p => ({
                    id: p.id,
                    fileName: p.fileName,
                    imageUrl: p.imageUrl,
                    maskImageUrl: p.maskImageUrl || null,
                    items: (p.items || []).map(item => ({
                        id: item.id,
                        text: item.text,
                        originalText: item.originalText,
                        box: { ...item.box },
                    })),
                })),
            };

            const json = JSON.stringify(saveData);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            const link = document.createElement("a");
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
            link.download = `manga-project-${timestamp}.json`;
            link.href = url;
            link.click();

            URL.revokeObjectURL(url);
            showToast("存档成功下载");
        } catch (e) {
            console.error("存档失败:", e);
            showToast("存档失败: " + e.message);
        }
    }

    function handleLoad() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const saveData = JSON.parse(text);

                // Validate format
                if (!saveData.version || !Array.isArray(saveData.pages)) {
                    showToast("读档失败：无效的存档文件格式");
                    return;
                }

                // Confirm if there are existing pages
                if (pages.length > 0) {
                    if (!confirm("当前已有页面，读档将替换所有内容。是否继续？")) {
                        return;
                    }
                }

                // Restore pages
                pages = saveData.pages.map(p => ({
                    id: p.id || crypto.randomUUID(),
                    fileName: p.fileName || "unknown.png",
                    imageUrl: p.imageUrl,
                    maskImageUrl: p.maskImageUrl || undefined,
                    items: (p.items || []).map(item => ({
                        id: item.id || crypto.randomUUID(),
                        text: item.text || "",
                        originalText: item.originalText || "",
                        box: { ...item.box },
                    })),
                }));

                activePageIndex = 0;
                activeBoxId = null;

                showToast(`读档成功，已加载 ${pages.length} 个页面`);
            } catch (err) {
                console.error("读档失败:", err);
                showToast("读档失败: " + err.message);
            }
        };

        input.click();
    }

    function handleKeyDown(e) {
        const target = e.target;
        const isInput =
            target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable;

        if (isInput) return;

        // Delete box
        if ((e.key === "Delete" || e.key === "Backspace") && activeBoxId) {
            e.preventDefault();
            deleteItem();
        }

        // Inpaint mode shortcuts
        if (activeTab === "inpaint") {
            if (e.key.toLowerCase() === "e") {
                isErasing = true;
                isAiMode = false;
            } else if (e.key.toLowerCase() === "b") {
                isErasing = false;
                isAiMode = false;
            } else if (e.key.toLowerCase() === "a") {
                isAiMode = true;
            }
        }
    }
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="h-screen w-screen flex flex-col overflow-hidden bg-gray-100 font-sans"
    ondrop={handleDrop}
    ondragover={handleDragOver}
>
    <Header
        onUpload={handleUpload}
        onExport={handleExport}
        {isExporting}
        onAutoDetect={handleAutoDetect}
        {isDetecting}
        onSettings={() => (showSettings = true)}
        onTranslation={() => (showTranslation = true)}
        onRecognizeAll={handleRecognizeAll}
        {isRecognizing}
        onOcrPage={handleOcrPage}
        {isOcring}
        onBatchOcr={handleBatchOcr}
        {isBatchOcring}
        onSave={handleSave}
        onLoad={handleLoad}
    />

    <div class="flex-1 flex overflow-hidden">
        <Sidebar
            {pages}
            {activePageIndex}
            {activeBoxId}
            onSelectPage={selectPage}
            onDeletePage={deletePage}
            onSelectBox={(id) => (activeBoxId = id)}
            onUpdateItem={updateItem}
        />

        <main class="flex-1 relative flex flex-col bg-gray-200 overflow-hidden">
            {#if pages.length === 0}
                <div
                    class="absolute inset-0 flex flex-col items-center justify-center text-gray-500"
                >
                    <svg
                        class="w-16 h-16 mb-4 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                    </svg>
                    <p class="text-xl font-medium mb-2">未选择图像</p>
                    <p class="text-sm">点击“上传页面”选择要翻译的漫画页面。</p>
                </div>
            {:else if activePage}
                <div
                    class="flex-1 overflow-auto p-4 flex items-center justify-center relative hide-scrollbar"
                    bind:this={workspaceRef}
                >
                    <Workspace
                        bind:page={activePage}
                        {activeBoxId}
                        {showMask}
                        {maskOpacity}
                        {isErasing}
                        {isAiMode}
                        {isStampMode}
                        {maskColor}
                        {brushSize}
                        {activeTab}
                        {isExporting}
                        onSelectBox={(id) => (activeBoxId = id)}
                        onUpdateItem={updateItem}
                        onUpdateMaskOpacity={(val) => (maskOpacity = val)}
                    />
                </div>
            {/if}
        </main>

        <Toolbar
            {activeItem}
            {activeTab}
            {isErasing}
            {isAiMode}
            {isStampMode}
            {brushSize}
            {showMask}
            {maskOpacity}
            {maskColor}
            onTabChange={handleTabChange}
            onUpdate={(box) => updateItem(box)}
            onDelete={deleteItem}
            onUpdateMaskMode={(mode) => {
                isAiMode = mode === "ai";
                isStampMode = mode === "stamp";
                if (mode !== "ai" && mode !== "stamp") {
                    isErasing = mode === "erase";
                }
            }}
            onUpdateMaskColor={(color) => (maskColor = color)}
            onUpdateBrushSize={(size) => (brushSize = size)}
            onToggleMask={() => (showMask = !showMask)}
            onUpdateMaskOpacity={(val) => (maskOpacity = val)}
            onApplyPresetToPage={applyPresetToPage}
            onApplyPresetToAll={applyPresetToAll}
        />
    </div>

    {#if showSettings}
        <SettingsModal onClose={() => (showSettings = false)} />
    {/if}

    {#if showTranslation}
        <TranslationModal {pages} onClose={() => (showTranslation = false)} />
    {/if}
</div>
