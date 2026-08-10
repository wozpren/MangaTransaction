<script>
    import { onMount } from "svelte";
    import { textDefaults } from "./textDefaults.svelte.js";
    import { getFontOffset } from "./fontOffsets.svelte.js";

    let {
        item,
        isActive,
        onSelect,
        onUpdate,
        containerWidth,
        containerHeight,
        zoom = 1,
        showBoxShadow = true,
    } = $props();

    let box = $derived(item.box);

    let elementRef;
    let textRef;

    let isDragging = $state(false);
    let isResizing = $state(false);
    let resizeHandle = $state("");
    let dragStartX = $state(0);
    let dragStartY = $state(0);
    let initialBoxX = $state(0);
    let initialBoxY = $state(0);
    let initialBoxW = $state(0);
    let initialBoxH = $state(0);

    // Sync contenteditable with state when prop changes, but avoid cursor jumps while typing
    $effect(() => {
        const currentText = item.text || "";
        if (textRef && document.activeElement !== textRef) {
            if (textRef.innerText !== currentText) {
                textRef.innerText = currentText;
            }
        }
    });

    function handleInput(e) {
        onUpdate({ ...item, text: e.target.innerText });
    }

    function handlePointerDown(e, type, handle = "") {
        if (e.button !== 0) return; // Only left click for these actions
        e.stopPropagation();
        onSelect();

        if (type === "drag") {
            isDragging = true;
        } else if (type === "resize") {
            isResizing = true;
            resizeHandle = handle;
        }

        dragStartX = e.clientX;
        dragStartY = e.clientY;
        initialBoxX = box.x;
        initialBoxY = box.y;
        initialBoxW = box.width;
        initialBoxH = box.height;

        // Add global event listeners to track movement outside the box
        window.addEventListener("pointermove", handleMouseMove);
        window.addEventListener("pointerup", handleMouseUp);
    }

    function handleMouseMove(e) {
        const dx = (e.clientX - dragStartX) / zoom;
        const dy = (e.clientY - dragStartY) / zoom;

        if (isDragging) {
            let newX = initialBoxX + dx;
            let newY = initialBoxY + dy;

            // Keep within bounds roughly
            newX = Math.max(0, Math.min(newX, containerWidth - box.width));
            newY = Math.max(0, Math.min(newY, containerHeight - box.height));

            onUpdate({ ...item, box: { ...item.box, x: newX, y: newY } });
        } else if (isResizing) {
            const angle = (box.rotation || 0) * Math.PI / 180;
            const cosLocal = Math.cos(-angle);
            const sinLocal = Math.sin(-angle);
            const localDx = dx * cosLocal - dy * sinLocal;
            const localDy = dx * sinLocal + dy * cosLocal;

            let newW = initialBoxW;
            let newH = initialBoxH;
            let dCxLocal = 0;
            let dCyLocal = 0;

            if (resizeHandle.includes("e")) {
                let delta = Math.max(20 - initialBoxW, localDx);
                newW = initialBoxW + delta;
                dCxLocal = delta / 2;
            }
            if (resizeHandle.includes("w")) {
                let delta = Math.max(20 - initialBoxW, -localDx);
                newW = initialBoxW + delta;
                dCxLocal = -delta / 2;
            }
            if (resizeHandle.includes("s")) {
                let delta = Math.max(20 - initialBoxH, localDy);
                newH = initialBoxH + delta;
                dCyLocal = delta / 2;
            }
            if (resizeHandle.includes("n")) {
                let delta = Math.max(20 - initialBoxH, -localDy);
                newH = initialBoxH + delta;
                dCyLocal = -delta / 2;
            }

            const cosScreen = Math.cos(angle);
            const sinScreen = Math.sin(angle);
            const dCxScreen = dCxLocal * cosScreen - dCyLocal * sinScreen;
            const dCyScreen = dCxLocal * sinScreen + dCyLocal * cosScreen;

            const initialCx = initialBoxX + initialBoxW / 2;
            const initialCy = initialBoxY + initialBoxH / 2;

            const newCx = initialCx + dCxScreen;
            const newCy = initialCy + dCyScreen;

            let newX = newCx - newW / 2;
            let newY = newCy - newH / 2;

            onUpdate({
                ...item,
                box: {
                    ...item.box,
                    x: newX,
                    y: newY,
                    width: newW,
                    height: newH,
                },
            });
        }
    }

    function handleMouseUp() {
        isDragging = false;
        isResizing = false;
        window.removeEventListener("pointermove", handleMouseMove);
        window.removeEventListener("pointerup", handleMouseUp);
    }

    let writingMode = $derived(box.writingMode || "horizontal-tb");
    let fontFamily = $derived(
        box.fontFamily && box.fontFamily !== "inherit"
            ? box.fontFamily
            : textDefaults.fontFamily,
    );
    let letterSpacing = $derived(box.letterSpacing ?? 0);
    let lineHeight = $derived(box.lineHeight ?? 1.4);
    let strokeWidth = $derived(box.strokeWidth ?? 0);
    let strokeColor = $derived(box.strokeColor ?? "#ffffff");

    // Convert alignment properties for CSS
    let justifyClass = $derived(
        (() => {
            if (writingMode === "vertical-rl") {
                // In vertical-rl, text-align controls vertical positioning
                // (since inline axis is vertical). Use text-start/center/end.
                return (
                    {
                        top: "justify-start text-start",
                        center: "justify-center text-center",
                        bottom: "justify-end text-end",
                    }[box.verticalAlign] || "justify-start text-start"
                );
            }
            return (
                {
                    left: "justify-start text-left",
                    center: "justify-center text-center",
                    right: "justify-end text-right",
                }[box.align] || "justify-center text-center"
            );
        })(),
    );

    let alignClass = $derived(
        (() => {
            if (writingMode === "vertical-rl") {
                // Cross axis is now horizontal (right to left)
                return (
                    {
                        left: "items-end",
                        center: "items-center",
                        right: "items-start",
                    }[box.align] || "items-center"
                );
            }
            return (
                {
                    top: "items-start",
                    center: "items-center",
                    bottom: "items-end",
                }[box.verticalAlign] || "items-start"
            );
        })(),
    );

    let boxBgRgba = $derived(
        (() => {
            let opacity = box.bgOpacity ?? 100;
            let hex = box.bg;
            if (!hex || hex === "transparent") return "transparent";

            if (hex.startsWith("#") && hex.length === 7) {
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
            }
            return hex;
        })(),
    );

    function escapeHtml(unsafe) {
        return (unsafe || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    let fontOffset = $derived(getFontOffset(fontFamily));
    let formattedText = $derived(
        escapeHtml(item.text).replace(
            /([，。！？、；：“”‘’（）《》])/g,
            `<span style="display: inline-block; transform: translate(${fontOffset.x}em, ${fontOffset.y}em);">$1</span>`
        )
    );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    bind:this={elementRef}
    class="absolute flex {justifyClass} {alignClass} group"
    class:ring-2={showBoxShadow || isActive}
    class:ring-indigo-500={isActive}
    class:z-10={isActive}
    class:z-0={!isActive}
    style="
        left: {box.x}px;
        top: {box.y}px;
        width: {box.width}px;
        height: {box.height}px;
        background-color: {boxBgRgba};
        color: {box.color};
        font-size: {box.fontSize}px;
        font-weight: {box.fontWeight || (box.bold ? 'bold' : 'normal')};
        font-style: {box.italic ? 'italic' : 'normal'};
        font-family: {fontFamily};
        writing-mode: {writingMode};
        letter-spacing: {letterSpacing}px;
        line-height: {lineHeight};
        cursor: {isDragging ? 'grabbing' : 'grab'};
        transform: rotate({box.rotation || 0}deg);
        transform-origin: center center;
    "
    onpointerdown={(e) => handlePointerDown(e, "drag")}
    onclick={(e) => {
        e.stopPropagation();
        onSelect();
    }}
>
    <!-- Container for two-layer rendering -->
    <div class="relative {writingMode === 'vertical-rl' ? 'h-full w-auto' : 'w-full h-auto'}">
        <!-- Presentation layer (rendered HTML) -->
        <div
            class="absolute inset-0 pointer-events-none p-1 overflow-hidden break-words whitespace-pre-wrap"
            style="
                {writingMode === 'vertical-rl' ? 'text-orientation: upright;' : ''}
                font-family: {fontFamily};
                -webkit-text-stroke: {strokeWidth}px {strokeColor};
                paint-order: stroke fill;
            "
        >
            {@html formattedText}
        </div>

        <!-- The editable text area (transparent) -->
        <div
            contenteditable="true"
            bind:this={textRef}
            oninput={handleInput}
            onmousedown={(e) => e.stopPropagation()}
            class="relative w-full h-full p-1 outline-none select-text cursor-text overflow-hidden break-words whitespace-pre-wrap"
            style="
                {writingMode === 'vertical-rl' ? 'text-orientation: upright;' : ''}
                font-family: {fontFamily};
                -webkit-text-stroke: {strokeWidth}px transparent;
                paint-order: stroke fill;
                color: transparent;
                caret-color: {box.color};
            "
        ></div>
    </div>

    <!-- Resize handles (only show when active or hovered) -->
    {#if isActive || isResizing}
        <!-- Corners -->
        <div
            class="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-indigo-500 rounded-full cursor-nwse-resize"
            onpointerdown={(e) => handlePointerDown(e, "resize", "nw")}
        ></div>
        <div
            class="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-indigo-500 rounded-full cursor-nesw-resize"
            onpointerdown={(e) => handlePointerDown(e, "resize", "ne")}
        ></div>
        <div
            class="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-indigo-500 rounded-full cursor-nesw-resize"
            onpointerdown={(e) => handlePointerDown(e, "resize", "sw")}
        ></div>
        <div
            class="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-indigo-500 rounded-full cursor-nwse-resize"
            onpointerdown={(e) => handlePointerDown(e, "resize", "se")}
        ></div>

        <!-- Edges -->
        <div
            class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-2 cursor-ns-resize"
            onpointerdown={(e) => handlePointerDown(e, "resize", "n")}
        ></div>
        <div
            class="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-4 h-2 cursor-ns-resize"
            onpointerdown={(e) => handlePointerDown(e, "resize", "s")}
        ></div>
        <div
            class="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-4 cursor-ew-resize"
            onpointerdown={(e) => handlePointerDown(e, "resize", "w")}
        ></div>
        <div
            class="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2 h-4 cursor-ew-resize"
            onpointerdown={(e) => handlePointerDown(e, "resize", "e")}
        ></div>
    {/if}
</div>
