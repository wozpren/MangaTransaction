<script>
    import {
        X,
        Save,
        Settings as SettingsIcon,
        RefreshCw,
    } from "lucide-svelte";
    import { apiSettings } from "$lib/api.js";
    import { showToast } from "./toast.js";

    let { onClose } = $props();

    // Create local copies of settings to draft edits
    let localSettings = $state({ ...apiSettings });
    let isSaving = $state(false);

    function handleSave() {
        isSaving = true;

        // Update the global settings reference
        Object.assign(apiSettings, localSettings);

        // Optionally save to localStorage here so user doesn't lose keys on refresh
        try {
            localStorage.setItem(
                "manga_trans_settings",
                JSON.stringify(localSettings),
            );
        } catch (e) {
            /* ignore */
        }

        setTimeout(() => {
            isSaving = false;
            onClose();
        }, 300);
    }

    function getModelsUrl(url) {
        try {
            const urlObj = new URL(url);
            const v1Match = url.match(/^(.*\/v1)/);
            if (v1Match) return v1Match[1] + "/models";
            return urlObj.origin + "/v1/models";
        } catch (e) {
            return "";
        }
    }

    let isFetchingTransModels = $state(false);
    let transModels = $state([]);

    async function fetchTransModels() {
        if (
            !localSettings.translationApiUrl ||
            !localSettings.translationApiKey
        ) {
            showToast("请输入自定义接口地址和 API 密钥");
            return;
        }
        isFetchingTransModels = true;
        try {
            const url = getModelsUrl(localSettings.translationApiUrl);
            const response = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${localSettings.translationApiKey}`,
                },
            });
            if (!response.ok)
                throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            transModels = data.data.map((m) => m.id);
            if (
                transModels.length > 0 &&
                !transModels.includes(localSettings.translationModelName)
            ) {
                localSettings.translationModelName = transModels[0];
            }
        } catch (e) {
            showToast("获取翻译模型失败: " + e.message);
        } finally {
            isFetchingTransModels = false;
        }
    }

    let isFetchingInpaintModels = $state(false);
    let inpaintModels = $state([]);

    async function fetchInpaintModels() {
        if (!localSettings.inpaintApiUrl || !localSettings.inpaintApiKey) {
            showToast("请输入修补 API 地址和 API 密钥");
            return;
        }
        isFetchingInpaintModels = true;
        try {
            const url = getModelsUrl(localSettings.inpaintApiUrl);
            const response = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${localSettings.inpaintApiKey}`,
                },
            });
            if (!response.ok)
                throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            inpaintModels = data.data.map((m) => m.id);
            if (
                inpaintModels.length > 0 &&
                !inpaintModels.includes(localSettings.inpaintModelName)
            ) {
                localSettings.inpaintModelName = inpaintModels[0];
            }
        } catch (e) {
            showToast("获取修补模型失败: " + e.message);
        } finally {
            isFetchingInpaintModels = false;
        }
    }

    // Try to load any previously saved settings
    import { onMount } from "svelte";
    onMount(() => {
        try {
            const saved = localStorage.getItem("manga_trans_settings");
            if (saved) {
                const parsed = JSON.parse(saved);
                localSettings = { ...localSettings, ...parsed };
                Object.assign(apiSettings, parsed);
            }
        } catch (e) {
            /* ignore */
        }
    });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
    onclick={onClose}
>
    <div
        class="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
        onclick={(e) => e.stopPropagation()}
    >
        <div
            class="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50"
        >
            <h2 class="text-lg font-bold text-gray-800 flex items-center gap-2">
                <SettingsIcon size={20} class="text-indigo-600" /> API 设置
            </h2>
            <button
                onclick={onClose}
                class="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-200"
            >
                <X size={20} />
            </button>
        </div>

        <div class="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
            <!-- Translation Settings -->
            <section class="space-y-4">
                <h3
                    class="text-sm font-semibold text-gray-800 uppercase tracking-wider border-b pb-1"
                >
                    OCR 服务
                </h3>

                <div class="space-y-1">
                    <label
                        for="ocr-key"
                        class="block text-sm font-medium text-gray-700"
                        >SiliconFlow API 密钥 (用于单框文字识别)</label
                    >
                    <input
                        type="password"
                        id="ocr-key"
                        bind:value={localSettings.ocrApiKey}
                        placeholder="SiliconFlow PaddleOCR API 密钥"
                        class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                </div>

                <div class="space-y-1">
                    <label
                        for="zhipu-ocr-key"
                        class="block text-sm font-medium text-gray-700"
                        >智谱 OCR API 密钥 (用于全图 OCR)</label
                    >
                    <input
                        type="password"
                        id="zhipu-ocr-key"
                        bind:value={localSettings.zhipuOcrApiKey}
                        placeholder="智谱 AI 开放平台 API 密钥"
                        class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                </div>

                <h3
                    class="text-sm font-semibold text-gray-800 uppercase tracking-wider border-b pb-1"
                >
                    翻译服务
                </h3>

                <div class="space-y-1">
                    <label
                        for="trans-model"
                        class="block text-sm font-medium text-gray-700"
                        >服务提供商</label
                    >
                    <select
                        id="trans-model"
                        bind:value={localSettings.translationModel}
                        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                        <option value="deepl">DeepL 接口</option>
                        <option value="gemini">Gemini</option>
                        <option value="deepseek">DeepSeek</option>
                        <option value="custom">自定义接口</option>
                    </select>
                </div>

                <div class="space-y-1">
                    <label
                        for="trans-key"
                        class="block text-sm font-medium text-gray-700"
                        >API 密钥</label
                    >
                    <input
                        type="password"
                        id="trans-key"
                        bind:value={localSettings.translationApiKey}
                        placeholder="在此处输入您的密钥..."
                        class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                </div>

                {#if localSettings.translationModel === "custom"}
                    <div class="space-y-1">
                        <label
                            for="trans-url"
                            class="block text-sm font-medium text-gray-700"
                            >自定义接口地址</label
                        >
                        <input
                            type="url"
                            id="trans-url"
                            bind:value={localSettings.translationApiUrl}
                            placeholder="https://your-api.com/translate"
                            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                    </div>
                {/if}

                <div class="space-y-1">
                    <div class="flex items-center justify-between">
                        <label
                            for="trans-model-name"
                            class="block text-sm font-medium text-gray-700"
                            >模型名称 (Model Name)</label
                        >
                        {#if localSettings.translationModel === "custom"}
                            <button
                                class="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
                                onclick={fetchTransModels}
                                disabled={isFetchingTransModels}
                            >
                                <RefreshCw
                                    size={12}
                                    class={isFetchingTransModels
                                        ? "animate-spin"
                                        : ""}
                                />
                                获取列表
                            </button>
                        {/if}
                    </div>
                    {#if transModels.length > 0}
                        <select
                            id="trans-model-name"
                            bind:value={localSettings.translationModelName}
                            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        >
                            {#each transModels as model}
                                <option value={model}>{model}</option>
                            {/each}
                        </select>
                    {:else}
                        <input
                            type="text"
                            id="trans-model-name"
                            bind:value={localSettings.translationModelName}
                            placeholder="例如: gpt-4o, gemini-1.5-pro, deepseek-chat"
                            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                    {/if}
                </div>
            </section>

            <!-- Inpainting Settings -->
            <section class="space-y-4 pt-2">
                <h3
                    class="text-sm font-semibold text-gray-800 uppercase tracking-wider border-b pb-1"
                >
                    图像修补（文本去除）
                </h3>
                <p class="text-xs text-gray-500">
                    需要支持图像遮罩的第三方或自定义托管 API。
                </p>

                <div class="space-y-1">
                    <label
                        for="inpaint-url"
                        class="block text-sm font-medium text-gray-700"
                        >修补 API 地址</label
                    >
                    <input
                        type="url"
                        id="inpaint-url"
                        bind:value={localSettings.inpaintApiUrl}
                        placeholder="https://your-hosted-inpaint.com/inpaint"
                        class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                </div>

                <div class="space-y-1">
                    <label
                        for="inpaint-key"
                        class="block text-sm font-medium text-gray-700"
                        >API 密钥（可选）</label
                    >
                    <input
                        type="password"
                        id="inpaint-key"
                        bind:value={localSettings.inpaintApiKey}
                        placeholder="如果需要，请输入认证密钥"
                        class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                </div>

                <div class="space-y-1">
                    <div class="flex items-center justify-between">
                        <label
                            for="inpaint-model-name"
                            class="block text-sm font-medium text-gray-700"
                            >修补模型名称 (Model Name)（可选）</label
                        >
                        <button
                            class="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
                            onclick={fetchInpaintModels}
                            disabled={isFetchingInpaintModels}
                        >
                            <RefreshCw
                                size={12}
                                class={isFetchingInpaintModels
                                    ? "animate-spin"
                                    : ""}
                            />
                            获取列表
                        </button>
                    </div>
                    {#if inpaintModels.length > 0}
                        <select
                            id="inpaint-model-name"
                            bind:value={localSettings.inpaintModelName}
                            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        >
                            {#each inpaintModels as model}
                                <option value={model}>{model}</option>
                            {/each}
                        </select>
                    {:else}
                        <input
                            type="text"
                            id="inpaint-model-name"
                            bind:value={localSettings.inpaintModelName}
                            placeholder="例如: lama, sd-v1.5-inpainting"
                            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                    {/if}
                </div>
            </section>
        </div>

        <div
            class="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3"
        >
            <button
                onclick={onClose}
                class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
                取消
            </button>
            <button
                onclick={handleSave}
                disabled={isSaving}
                class="px-4 py-2 bg-indigo-600 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
                {#if isSaving}
                    <div
                        class="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"
                    ></div>
                    保存中...
                {:else}
                    <Save size={16} />
                    保存配置
                {/if}
            </button>
        </div>
    </div>
</div>
