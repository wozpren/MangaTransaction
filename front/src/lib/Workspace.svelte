<script>
    import { onMount, onDestroy } from "svelte";
    import TextBox from "./TextBox.svelte";
    import { createDefaultBox } from "./textDefaults.svelte.js";
    import { showToast } from "./toast.js";

    let {
        page = $bindable(),
        activeBoxId,
        showMask,
        maskOpacity,
        isErasing,
        isAiMode,
        isStampMode,
        maskColor,
        brushSize,
        activeTab,
        isExporting,
        onSelectBox,
        onUpdateItem,
        onUpdateMaskOpacity,
    } = $props();

    // Viewport & Zoom State
    let zoom = $state(1);
    let panX = $state(0);
    let panY = $state(0);

    // Toggle Textbox outline/shadow
    let showBoxShadow = $state(true);
    let effectiveShowBoxShadow = $derived(showBoxShadow && !isExporting);

    // Interaction State
    let isPanning = $state(false);
    let isSpaceDown = $state(false);
    let lastMouseX = $state(0);
    let lastMouseY = $state(0);
    let mouseX = $state(0);
    let mouseY = $state(0);
    let showBrushPreview = $state(false);

    // Box Creation State
    let isCreatingBox = $state(false);
    let createStartX = $state(0);
    let createStartY = $state(0);
    let currentCreationX = $state(0);
    let currentCreationY = $state(0);

    let isDrawing = $state(false);
    let canvasRef = $state(null);
    let maskCtx = $state(null);
    let imageRef = $state(null);
    let containerRef = $state(null);

    // AI Selection State
    let aiSelectionBox = $state(null);
    let isAiSelecting = $state(false);
    let aiStartX = 0;
    let aiStartY = 0;
    let isSendingToAi = $state(false);

    // Clone Stamp State
    let cloneSourceX = $state(null);
    let cloneSourceY = $state(null);
    let cloneStartDrawX = 0;
    let cloneStartDrawY = 0;

    // Dimensions
    let imageWidth = $state(0);
    let imageHeight = $state(0);

    // Smooth Drawing
    let lastDrawX = 0;
    let lastDrawY = 0;

    // Fit Image
    function fitImage() {
        if (containerRef && imageWidth > 0 && imageHeight > 0) {
            const cw = containerRef.clientWidth;
            const ch = containerRef.clientHeight;
            const padding = 60;
            const scaleX = (cw - padding) / imageWidth;
            const scaleY = (ch - padding) / imageHeight;
            zoom = Math.min(scaleX, scaleY, 1);
            panX = (cw - imageWidth * zoom) / 2;
            panY = (ch - imageHeight * zoom) / 2;
        }
    }

    function handleImageLoad(e) {
        imageWidth = e.target.naturalWidth;
        imageHeight = e.target.naturalHeight;

        fitImage();
        initMaskCanvas();
    }

    function initMaskCanvas() {
        if (!canvasRef || imageWidth === 0 || imageHeight === 0) return;
        canvasRef.width = imageWidth;
        canvasRef.height = imageHeight;
        maskCtx = canvasRef.getContext("2d", { willReadFrequently: true });

        if (page.maskImageUrl) {
            loadMaskImage(page.maskImageUrl);
        }
    }

    function loadMaskImage(url) {
        if (!maskCtx) return;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            maskCtx.globalCompositeOperation = "source-over";
            maskCtx.clearRect(0, 0, imageWidth, imageHeight);

            // Create a temp canvas to detect if it's B&W or Transparent
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = imageWidth;
            tempCanvas.height = imageHeight;
            const tempCtx = tempCanvas.getContext("2d");
            tempCtx.drawImage(img, 0, 0, imageWidth, imageHeight);

            const imageData = tempCtx.getImageData(
                0,
                0,
                imageWidth,
                imageHeight,
            );
            const data = imageData.data;

            // If the image is opaque (like from our B&W API), convert it to Red + Transparent
            // Checking first 100 pixels is usually enough to guess the format, or just check global alpha
            let isOpaque = true;
            for (let i = 0; i < data.length; i += 400) {
                // Samples
                if (data[i + 3] < 255) {
                    isOpaque = false;
                    break;
                }
            }

            if (isOpaque) {
                // Convert B&W to Red + Transparent
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    // If it's towards white, make it red
                    if (r > 128 || g > 128 || b > 128) {
                        data[i] = 255;
                        data[i + 1] = 255;
                        data[i + 2] = 255;
                        data[i + 3] = 255;
                    } else {
                        // Else make it transparent
                        data[i + 3] = 0;
                    }
                }
                maskCtx.putImageData(imageData, 0, 0);
            } else {
                // Already transparent (likely user drawn or already processed)
                maskCtx.drawImage(img, 0, 0, imageWidth, imageHeight);
            }
        };
        img.src = url;
    }

    $effect(() => {
        // Redraw if maskImageUrl changes from external (like auto-detect)
        // Make sure not to clear if we are currently drawing
        if (!isDrawing && page.maskImageUrl && maskCtx && canvasRef) {
            loadMaskImage(page.maskImageUrl);
        }
    });

    function saveMask() {
        if (canvasRef) {
            // We save as Transparent Red PNG
            // To be compatible with B&W inpainters, it's better to convert back to B&W or keep as is?
            // "共享" (shared) implies we should probably keep as is but visualization is separate?
            // Actually, many inpainters accept transparent masks.
            const url = canvasRef.toDataURL("image/png");
            if (page.maskImageUrl !== url) {
                page.maskImageUrl = url;
            }
        }
    }

    function handleWheel(e) {
        e.preventDefault();

        const zoomSensitivity = 0.0015;
        const delta = -e.deltaY * zoomSensitivity;
        let newZoom = zoom * (1 + delta);
        newZoom = Math.max(0.05, Math.min(newZoom, 10)); // Allow good zoom range

        if (containerRef) {
            const rect = containerRef.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const zoomRatio = newZoom / zoom;

            panX = mouseX - (mouseX - panX) * zoomRatio;
            panY = mouseY - (mouseY - panY) * zoomRatio;
        }

        zoom = newZoom;
    }

    function handleKeyDown(e) {
        // Prevent pan stealing if typing in textbox
        if (
            e.target.isContentEditable ||
            e.target.tagName === "INPUT" ||
            e.target.tagName === "TEXTAREA"
        )
            return;

        if (e.code === "Space") {
            isSpaceDown = true;
            e.preventDefault();
        }
    }

    function handleKeyUp(e) {
        if (e.code === "Space") {
            isSpaceDown = false;
            isPanning = false;
        }
    }

    function handlePointerDown(e) {
        if (isSpaceDown || e.button === 1 || e.button === 2) {
            // Middle or right click also pan
            e.preventDefault();
            isPanning = true;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            return;
        }

        if (activeTab === "inpaint") {
            const pos = getCanvasPos(e);
            
            // 点击如果在图片外，则不响应框选或涂抹
            if (pos.x < 0 || pos.x > imageWidth || pos.y < 0 || pos.y > imageHeight) {
                return;
            }

            if (isStampMode) {
                if (e.altKey) {
                    cloneSourceX = Math.max(0, Math.min(pos.x, imageWidth));
                    cloneSourceY = Math.max(0, Math.min(pos.y, imageHeight));
                    showToast("已设置图章源点");
                    return;
                }
                
                if (cloneSourceX === null || cloneSourceY === null) {
                    showToast("请先按住 Alt 键点击以设置图章源点");
                    return;
                }

                isDrawing = true;
                lastDrawX = pos.x;
                lastDrawY = pos.y;
                cloneStartDrawX = pos.x;
                cloneStartDrawY = pos.y;
                drawOnMask(e);
                return;
            }

            if (isAiMode) {
                // If clicking inside existing aiSelectionBox, do nothing (or maybe clear it)
                // Let's just start drawing a new box
                isAiSelecting = true;
                aiStartX = Math.max(0, Math.min(pos.x, imageWidth));
                aiStartY = Math.max(0, Math.min(pos.y, imageHeight));
                aiSelectionBox = {
                    x: aiStartX,
                    y: aiStartY,
                    width: 0,
                    height: 0,
                };
                return;
            }

            isDrawing = true;
            lastDrawX = pos.x;
            lastDrawY = pos.y;
            drawOnMask(e);
            return;
        }

        if (activeTab === "text") {
            const isOnWorkspace =
                e.target === containerRef || e.target.closest(".transform-gpu");
            const isOnUI = e.target.closest(".pointer-events-auto");

            // Only start box creation if we're on the workspace/image and NOT clicking UI or an existing box
            // Note: TextBox.svelte stops propagation, so we won't get here if we clicked a box.
            if (isOnWorkspace && !isOnUI) {
                onSelectBox(null);
                
                const rect = containerRef.getBoundingClientRect();
                const startX = (e.clientX - rect.left - panX) / zoom;
                const startY = (e.clientY - rect.top - panY) / zoom;
                
                // 如果在图片外部点击，则不开始创建文本框，但依然会取消选中
                if (startX < 0 || startX > imageWidth || startY < 0 || startY > imageHeight) {
                    return;
                }

                isCreatingBox = true;
                createStartX = startX;
                createStartY = startY;
                currentCreationX = createStartX;
                currentCreationY = createStartY;
            }
        }
    }

    function handlePointerMove(e) {
        if (isPanning) {
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            panX += dx;
            panY += dy;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            return;
        }

        if (isDrawing && activeTab === "inpaint" && !isAiMode) {
            drawOnMask(e);
        }

        if (isAiSelecting && activeTab === "inpaint" && isAiMode) {
            const pos = getCanvasPos(e);
            const currentX = Math.max(0, Math.min(pos.x, imageWidth));
            const currentY = Math.max(0, Math.min(pos.y, imageHeight));
            aiSelectionBox = {
                x: Math.min(aiStartX, currentX),
                y: Math.min(aiStartY, currentY),
                width: Math.abs(currentX - aiStartX),
                height: Math.abs(currentY - aiStartY),
            };
        }

        if (isCreatingBox) {
            const rect = containerRef.getBoundingClientRect();
            currentCreationX = (e.clientX - rect.left - panX) / zoom;
            currentCreationY = (e.clientY - rect.top - panY) / zoom;
        }

        if (activeTab === "inpaint") {
            const rect = containerRef.getBoundingClientRect();
            mouseX = e.clientX - rect.left;
            mouseY = e.clientY - rect.top;
            showBrushPreview = true;
        } else {
            showBrushPreview = false;
        }
    }

    function handlePointerUp(e) {
        isPanning = false;
        if (isDrawing) {
            isDrawing = false;
            saveMask();
        }

        if (isAiSelecting) {
            isAiSelecting = false;
            if (
                aiSelectionBox &&
                (aiSelectionBox.width < 10 || aiSelectionBox.height < 10)
            ) {
                aiSelectionBox = null;
            }
        }

        if (isCreatingBox) {
            isCreatingBox = false;

            const rect = containerRef.getBoundingClientRect();
            const endX = (e.clientX - rect.left - panX) / zoom;
            const endY = (e.clientY - rect.top - panY) / zoom;

            let startX = Math.min(createStartX, endX);
            let startY = Math.min(createStartY, endY);
            let width = Math.abs(endX - createStartX);
            let height = Math.abs(endY - createStartY);

            // If it's a very tiny drag (likely just a click), use default size
            if (width < 20 && height < 20) {
                return;
            } else {
                // Dragged a bit, but ensure it's not too small to be usable
                width = Math.max(40, width);
                height = Math.max(40, height);
            }

            // Ensure it's somewhat within the image bounds, otherwise it might be accidental
            const isWithinImage =
                startX < imageWidth &&
                startY < imageHeight &&
                startX + width > 0 &&
                startY + height > 0;

            if (isWithinImage) {
                const newBox = {
                    id: crypto.randomUUID(),
                    text: "",
                    originalText: "",
                    box: createDefaultBox({
                        x: startX,
                        y: startY,
                        width: width,
                        height: height,
                    }),
                };
                onUpdateItem(newBox, true);
            }
        }
    }

    function getCanvasPos(e) {
        if (!canvasRef) return { x: 0, y: 0 };
        const rect = canvasRef.getBoundingClientRect();
        const scaleX = canvasRef.width / rect.width;
        const scaleY = canvasRef.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    }

    function drawOnMask(e) {
        if (!maskCtx) return;

        const pos = getCanvasPos(e);
        const actualBrushSize = brushSize / zoom;

        if (isStampMode) {
            if (cloneSourceX === null) return;
            
            maskCtx.globalCompositeOperation = "source-over";
            
            const dx = pos.x - lastDrawX;
            const dy = pos.y - lastDrawY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Interpolate points to ensure continuous stamping
            const step = Math.max(1, actualBrushSize / 4);
            const steps = Math.max(1, Math.ceil(distance / step));
            
            for (let i = 1; i <= steps; i++) {
                const interpX = lastDrawX + dx * (i / steps);
                const interpY = lastDrawY + dy * (i / steps);
                
                const offsetX = interpX - cloneStartDrawX;
                const offsetY = interpY - cloneStartDrawY;
                
                const srcX = cloneSourceX + offsetX;
                const srcY = cloneSourceY + offsetY;
                
                maskCtx.save();
                maskCtx.beginPath();
                maskCtx.arc(interpX, interpY, actualBrushSize / 2, 0, Math.PI * 2);
                maskCtx.clip();
                
                if (imageRef) {
                    maskCtx.drawImage(
                        imageRef,
                        srcX - actualBrushSize / 2, srcY - actualBrushSize / 2, actualBrushSize, actualBrushSize,
                        interpX - actualBrushSize / 2, interpY - actualBrushSize / 2, actualBrushSize, actualBrushSize
                    );
                }
                maskCtx.restore();
            }
            
            lastDrawX = pos.x;
            lastDrawY = pos.y;
            return;
        }

        maskCtx.beginPath();
        maskCtx.lineCap = "round";
        maskCtx.lineJoin = "round";
        maskCtx.lineWidth = actualBrushSize;

        if (isErasing) {
            maskCtx.globalCompositeOperation = "destination-out";
        } else {
            maskCtx.globalCompositeOperation = "source-over";
            maskCtx.strokeStyle = maskColor || "rgba(255, 255, 255, 1)";
        }

        maskCtx.moveTo(lastDrawX, lastDrawY);
        maskCtx.lineTo(pos.x, pos.y);
        maskCtx.stroke();

        lastDrawX = pos.x;
        lastDrawY = pos.y;
    }

    function handleDoubleClick(e) {
        if (activeTab !== "text") return;

        if (!containerRef) return;
        const rect = containerRef.getBoundingClientRect();
        const clickX = e.clientX - rect.left - panX;
        const clickY = e.clientY - rect.top - panY;

        const imgX = clickX / zoom;
        const imgY = clickY / zoom;

        // Ensure clicking is inside image
        if (imgX < 0 || imgX > imageWidth || imgY < 0 || imgY > imageHeight) {
            return;
        }

        const newBox = {
            id: crypto.randomUUID(),
            text: "",
            originalText: "",
            box: createDefaultBox({
                x: imgX,
                y: imgY,
                width: 60,
                height: 180,
            }),
        };

        // Pass true as second param to indicate it's new and should be selected
        onUpdateItem(newBox, true);
    }

    // Attach non-passive wheel event
    onMount(() => {
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        window.addEventListener("pointerup", handlePointerUp);

        if (containerRef) {
            containerRef.addEventListener("wheel", handleWheel, {
                passive: false,
            });
        }
    });

    onDestroy(() => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
        window.removeEventListener("pointerup", handlePointerUp);
        if (containerRef) {
            containerRef.removeEventListener("wheel", handleWheel);
        }
    });

    // Make sure to redraw mask when actively going to inpaint tab, just in case
    $effect(() => {
        // 只有当 tab 切换到 inpaint，且当前 Canvas 里的内容和状态里的内容不一致时才同步
        if (
            activeTab === "inpaint" &&
            page.maskImageUrl &&
            maskCtx &&
            canvasRef
        ) {
            // 只有在非绘画状态下执行同步
            if (!isDrawing) {
                const img = new Image();
                img.onload = () => {
                    // 如果需要更严谨，可以对比当前 canvas.toDataURL() 是否等于 page.maskImageUrl
                    // 但通常 saveMask 更新了状态后，这里的逻辑会触发，所以要小心死循环
                    maskCtx.clearRect(0, 0, imageWidth, imageHeight);
                    maskCtx.drawImage(img, 0, 0, imageWidth, imageHeight);
                };
                img.src = page.maskImageUrl;
            }
        }
    });
    function setZoom(newZoom) {
        if (containerRef && imageWidth > 0) {
            const cw = containerRef.clientWidth;
            const ch = containerRef.clientHeight;

            zoom = newZoom;
            panX = (cw - imageWidth * zoom) / 2;
            panY = (ch - imageHeight * zoom) / 2;
        }
    }

    // AI API Call
    async function downloadCroppedImage() {
        // 基础校验
        if (!aiSelectionBox || !imageRef || isSendingToAi) return;

        isSendingToAi = true;

        try {
            // 1. 创建临时 Canvas 用于提取裁剪区域
            const extractCanvas = document.createElement("canvas");
            extractCanvas.width = aiSelectionBox.width;
            extractCanvas.height = aiSelectionBox.height;
            const ctx = extractCanvas.getContext("2d");

            // 2. 绘制图片裁剪部分
            ctx.drawImage(
                imageRef,
                aiSelectionBox.x,
                aiSelectionBox.y,
                aiSelectionBox.width,
                aiSelectionBox.height,
                0,
                0,
                aiSelectionBox.width,
                aiSelectionBox.height,
            );

            // 3. 将 Canvas 转换为 Blob 对象 (这是复制到剪贴板的关键)
            const blob = await new Promise((resolve) =>
                extractCanvas.toBlob(resolve, "image/png"),
            );

            if (!blob) {
                throw new Error("未能生成图片数据");
            }

            // 4. 执行复制到剪贴板逻辑
            // 使用 ClipboardItem 包装 Blob
            const data = [new ClipboardItem({ [blob.type]: blob })];
            await navigator.clipboard.write(data);

            // 可选：给用户一个简单的提示
            console.log("图片已成功复制到剪贴板");
            showToast("图片已复制到剪贴板");
        } catch (e) {
            console.error("复制失败:", e);
            // 如果是因为浏览器不支持或权限问题，给出提示
            if (e.name === "NotAllowedError") {
                showToast(
                    "复制失败：请确保已授予剪贴板权限，且在 HTTPS 环境下运行。",
                );
            } else {
                showToast("图片复制失败: " + e.message);
            }
        } finally {
            isSendingToAi = false;
        }
    }

    /**
     * 将用户上传的、修改后的图片块贴回原 Canvas 的对应位置
     * @param {File} modifiedFile - 用户选择的修改后的图片文件对象
     */
    async function pasteModifiedImageBack(event) {
        const file = event.target.files[0];
        if (!file || !canvasRef || !aiSelectionBox) return;

        try {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.src = url;

            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });

            // 核心：精准贴回
            maskCtx.drawImage(
                img,
                aiSelectionBox.x,
                aiSelectionBox.y,
                aiSelectionBox.width,
                aiSelectionBox.height,
            );

            saveMask();

            URL.revokeObjectURL(url);
            event.target.value = ""; // 重置，确保能重复上传同名文件
            console.log("图片贴回成功！");
        } catch (err) {
            showToast("处理图片失败");
        }
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="w-full h-full relative overflow-hidden bg-[#e5e7eb] select-none transition-colors duration-200"
    class:cursor-grab={isSpaceDown && !isPanning}
    class:cursor-grabbing={isPanning}
    class:cursor-crosshair={activeTab === "inpaint"}
    bind:this={containerRef}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerleave={() => (showBrushPreview = false)}
    ondblclick={handleDoubleClick}
    oncontextmenu={(e) => {
        // Only prevent context menu on right click if we are panning with it
        if (isPanning || isSpaceDown) e.preventDefault();
    }}
>
    <!-- Transform Container -->
    <div
        class="absolute transform-gpu shadow-2xl bg-white"
        style="
            transform: translate({panX}px, {panY}px) scale({zoom});
            transform-origin: 0 0;
            width: {imageWidth > 0 ? imageWidth + 'px' : 'auto'};
            height: {imageHeight > 0 ? imageHeight + 'px' : 'auto'};
        "
    >
        <!-- The Comic Image -->
        {#if page.imageUrl}
            <!-- svelte-ignore a11y_missing_attribute -->
            <img
                bind:this={imageRef}
                src={page.imageUrl}
                class="absolute inset-0 pointer-events-none w-full h-full object-contain"
                onload={handleImageLoad}
                ondragstart={(e) => e.preventDefault()}
            />
        {/if}

        <!-- The Inpaint Mask Canvas -->
        <canvas
            bind:this={canvasRef}
            class="absolute inset-0"
            style="
                opacity: {maskOpacity};
                display: {imageWidth > 0 ? 'block' : 'none'};
                pointer-events: {activeTab === 'inpaint' ? 'auto' : 'none'};
                background-color: {showMask ? 'rgb(0 0 0 / 70%)' : 'none'};
            "
        ></canvas>

        {#if activeTab === "inpaint" && aiSelectionBox}
            <div
                class="absolute border-2 border-dashed border-red-500 bg-red-500/10 pointer-events-none"
                style="
                    left: {aiSelectionBox.x}px;
                    top: {aiSelectionBox.y}px;
                    width: {aiSelectionBox.width}px;
                    height: {aiSelectionBox.height}px;
                "
            >
                <div
                    class="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full pt-4 pointer-events-auto flex w-max items-center gap-3"
                >
                    <input
                        type="file"
                        id="ai-file-upload"
                        class="hidden"
                        accept="image/*"
                        onchange={pasteModifiedImageBack}
                        onpointerdown={(e) => e.stopPropagation()}
                    />
                    <label
                        for="ai-file-upload"
                        onpointerdown={(e) => e.stopPropagation()}
                        class="cursor-pointer inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-lg shadow-sm transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        <svg
                            class="w-4 h-4 mr-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                            ></path>
                        </svg>
                        贴回修改后的图片
                    </label>
                    <button
                        class="cursor-pointer inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium rounded-lg shadow-sm transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        onclick={downloadCroppedImage}
                        disabled={isSendingToAi}
                        onpointerdown={(e) => e.stopPropagation()}
                    >
                        <svg 
                            class="w-4 h-4 mr-2" 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24" 
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path 
                                stroke-linecap="round" 
                                stroke-linejoin="round" 
                                stroke-width="2" 
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                            ></path>
                        </svg>
                        {isSendingToAi ? "处理中..." : "下载待修复块"}
                    </button>
                </div>
            </div>
        {/if}

        <!-- Text Boxes Layer -->
        {#if activeTab === "text"}
            <div class="absolute inset-0 pointer-events-none">
                {#each page.items || [] as item (item.id)}
                    <div style="pointer-events: auto;">
                        <TextBox
                            {item}
                            isActive={item.id === activeBoxId}
                            containerWidth={imageWidth}
                            containerHeight={imageHeight}
                            {zoom}
                            showBoxShadow={effectiveShowBoxShadow}
                            onSelect={() => onSelectBox(item.id)}
                            onUpdate={(updatedItem) =>
                                onUpdateItem(updatedItem, false)}
                        />
                    </div>
                {/each}

                <!-- Box Creation Preview -->
                {#if isCreatingBox}
                    <div
                        class="absolute border-2 border-dashed border-indigo-500 bg-indigo-500/10 pointer-events-none"
                        style="
                            left: {Math.min(createStartX, currentCreationX)}px;
                            top: {Math.min(createStartY, currentCreationY)}px;
                            width: {Math.abs(
                            currentCreationX - createStartX,
                        )}px;
                            height: {Math.abs(
                            currentCreationY - createStartY,
                        )}px;
                        "
                    ></div>
                {/if}
            </div>
        {/if}
    </div>

    <!-- UI Overlay Controls -->
    <div class="absolute bottom-4 right-4 flex gap-2 pointer-events-auto">
        {#if activeTab === "text"}
            <button
                class="bg-white/90 backdrop-blur px-3 py-1.5 rounded shadow-sm text-sm font-medium hover:bg-white text-gray-700 transition flex items-center justify-center border border-gray-200"
                onclick={() => (showBoxShadow = !showBoxShadow)}
                onpointerdown={(e) => e.stopPropagation()}
                title="显示/隐藏文本框边框"
            >
                {showBoxShadow ? "隐藏边框" : "显示边框"}
            </button>
        {/if}
        <button
            class="bg-white/90 backdrop-blur px-3 py-1.5 rounded shadow-sm text-sm font-medium hover:bg-white text-gray-700 transition flex items-center justify-center border border-gray-200"
            onclick={() => setZoom(1)}
            title="1:1 Size"
        >
            1:1
        </button>
        <button
            class="bg-white/90 backdrop-blur px-3 py-1.5 rounded shadow-sm text-sm font-medium hover:bg-white text-gray-700 transition flex items-center justify-center border border-gray-200"
            onclick={fitImage}
            title="Fit to Screen"
        >
            Fit
        </button>
        <div
            class="bg-white/90 backdrop-blur px-3 py-1.5 rounded shadow-sm text-sm font-medium text-gray-700 flex items-center justify-center border border-gray-200 min-w-12"
        >
            {Math.round(zoom * 100)}%
        </div>
    </div>

    <div
        class="absolute bottom-4 left-4 bg-white/90 backdrop-blur px-4 py-3 rounded-xl shadow-lg border border-gray-200 pointer-events-auto flex flex-col gap-2 w-48"
    >
        <div class="flex items-center justify-between">
            <span
                class="text-xs font-bold text-gray-500 uppercase tracking-wider"
                >遮罩不透明度</span
            >
            <span class="text-indigo-600 font-bold text-xs"
                >{Math.round((maskOpacity || 0) * 100)}%</span
            >
        </div>
        <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={maskOpacity || 1}
            oninput={(e) => onUpdateMaskOpacity(parseFloat(e.target.value))}
            class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
        />
    </div>

    <!-- Helper Text -->
    {#if activeTab === "text"}
        <div
            class="absolute top-4 left-4 bg-white/80 backdrop-blur px-3 py-1.5 rounded shadow-sm text-sm text-gray-600 pointer-events-none"
        >
            Space+Drag 或 鼠标中键拖动画布 | 滚轮缩放 | 单击或拖动添加文本框
        </div>
    {:else}
        <div
            class="absolute top-4 left-4 bg-white/80 backdrop-blur px-3 py-1.5 rounded shadow-sm text-sm text-gray-600 pointer-events-none"
        >
            {isAiMode
                ? "框选需要修补的区域 | Space+Drag 拖动画布"
                : "涂抹生成选区 | Space+Drag 拖动画布"}
        </div>
    {/if}

    <!-- Brush Preview -->
    {#if activeTab === "inpaint" && showBrushPreview && !isAiMode}
        <div
            class="absolute pointer-events-none rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)] bg-white/20"
            style="
                left: {mouseX}px;
                top: {mouseY}px;
                width: {brushSize}px;
                height: {brushSize}px;
                transform: translate(-50%, -50%);
                z-index: 50;
            "
        ></div>
    {/if}
</div>
