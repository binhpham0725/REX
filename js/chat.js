/**
 * T-Rex Local AI Chatbot Module
 * Kết nối với Ollama AI đang chạy trực tiếp trên máy tính qua Server API (/api/ai/chat)
 * Hỗ trợ: Real-time Streaming, Thinking Process (collapsible), Model Selection, Markdown styling
 */

(function () {
    // Trạng thái của Chatbot
    const chatState = {
        isOpen: false,
        selectedModel: 'qwen-fast:latest',
        availableModels: [],
        think: false, // MẶC ĐỊNH FALSE ĐỂ TRẢ LỜI NGAY TRONG VÀI GIÂY, KHÔNG SUY NGHĨ NGÂM PHÚT
        messages: [
            {
                role: 'system',
                content: 'Bạn là T-Rex AI - một chú khủng long vui nhộn, thông minh tích hợp trên web game T-Rex Runner. Hãy trả lời ngắn gọn, thân thiện bằng tiếng Việt, đi thẳng vào câu hỏi.'
            }
        ],
        isGenerating: false,
        abortController: null
    };

    // Khởi tạo các DOM elements khi trang tải xong
    document.addEventListener('DOMContentLoaded', initChat);

    function initChat() {
        renderChatHTML();
        bindChatEvents();
        fetchModels();
    }

    // 0. Xác định địa chỉ API Server thông minh
    function getApiEndpoint(endpointPath) {
        // Nếu trang web đang chạy trên bất kỳ HTTP/HTTPS host nào (Vercel, Localhost, IP mạng LAN...)
        if (window.location.protocol.startsWith('http')) {
            return endpointPath; // LUÔN DÙNG ĐƯỜNG DẪN TƯƠNG ĐỐI TRÊN CÙNG DOMAIN
        }
        // Chỉ khi mở bằng file:// cục bộ (double-click index.html offline không qua server)
        return 'http://localhost:8080' + endpointPath;
    }

    // 1. Tạo giao diện HTML cho Nút mở chat và Cửa sổ chat
    function renderChatHTML() {
        // Nút mở chat dạng Floating Action Button (FAB)
        const fabBtn = document.createElement('button');
        fabBtn.id = 'aiChatFab';
        fabBtn.className = 'ai-chat-fab';
        fabBtn.title = 'Mở khung chat với AI Local (Ollama)';
        fabBtn.innerHTML = `
            <div class="fab-icon-wrapper">
                <span class="fab-icon">🤖</span>
                <span class="fab-pulse-ring"></span>
            </div>
            <span class="fab-text">Chat với AI</span>
            <span class="fab-badge" id="aiStatusBadge" title="Đang kiểm tra kết nối AI..."></span>
        `;
        document.body.appendChild(fabBtn);

        // Khung cửa sổ Chat (Chat Window)
        const chatWindow = document.createElement('div');
        chatWindow.id = 'aiChatWindow';
        chatWindow.className = 'ai-chat-window';
        chatWindow.innerHTML = `
            <!-- Header -->
            <div class="ai-chat-header">
                <div class="ai-header-left">
                    <span class="ai-avatar">🦖</span>
                    <div class="ai-header-info">
                        <div class="ai-title-row">
                            <span class="ai-name">T-Rex Local AI</span>
                            <span class="ai-status-indicator online" id="aiStatusIndicator" title="Ollama đang hoạt động">● Online</span>
                        </div>
                        <div class="ai-model-selector-wrapper">
                            <span class="model-icon">⚡</span>
                            <select id="aiModelSelect" class="ai-model-select" title="Chọn mô hình AI trên máy">
                                <option value="qwen-fast:latest">qwen-fast:latest</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="ai-header-actions">
                    <button id="aiModeToggleBtn" class="ai-mode-toggle-btn fast" title="Chế độ phản hồi: Bấm để chuyển giữa Nhanh (vài giây) hoặc Suy nghĩ sâu">
                        <span class="mode-icon">⚡</span>
                        <span class="mode-text">Nhanh</span>
                    </button>
                    <button id="aiSettingsBtn" class="ai-icon-btn" title="Cài đặt kết nối AI (Vercel Cloud / Ngrok Tunnel)">⚙️</button>
                    <button id="aiClearBtn" class="ai-icon-btn" title="Xóa lịch sử trò chuyện">🗑️</button>
                    <button id="aiCloseBtn" class="ai-icon-btn" title="Đóng khung chat">✕</button>
                </div>
            </div>

            <!-- Panel Cài đặt kết nối Ollama -->
            <div class="ai-settings-panel" id="aiSettingsPanel">
                <div class="settings-header">
                    <strong>⚙️ KẾT NỐI OLLAMA TRÊN MÁY</strong>
                    <button id="aiCloseSettingsBtn" class="close-settings-btn">✕</button>
                </div>
                <div class="settings-desc">
                    Đường dẫn API kết nối trực tiếp đến mô hình Ollama trên máy tính của bạn:
                </div>
                <div class="settings-input-group">
                    <label>Link Ngrok Ollama:</label>
                    <input type="url" id="aiTunnelInput" class="ai-tunnel-input" placeholder="https://e6a0-116-99-255-211.ngrok-free.app" spellcheck="false">
                    <span style="font-size:10px; color:var(--text-muted); margin-top:3px;">Lệnh bật trên máy: <code>ngrok http 11434 --host-header=localhost:11434</code></span>
                </div>
                <div class="settings-actions" style="margin-top:8px;">
                    <button id="aiSaveTunnelBtn" class="btn btn-sm primary">💾 Lưu kết nối</button>
                    <button id="aiResetTunnelBtn" class="btn btn-sm">↺ Đặt lại mặc định</button>
                </div>
            </div>

            <!-- Messages Container -->
            <div class="ai-chat-body" id="aiChatBody">
                <!-- Lời chào mở đầu -->
                <div class="ai-msg-bubble ai-msg-welcome">
                    <div class="msg-avatar">🦖</div>
                    <div class="msg-content">
                        <p><strong>Xin chào!</strong> Mình là AI chạy trực tiếp trên máy tính của bạn (qua <strong>Ollama Local</strong>).</p>
                        <p>Bạn có thể hỏi mình mọi thứ: mẹo chơi game Khủng Long đạt điểm cao, lập trình, giải toán hay tâm sự vui vẻ!</p>
                        <div class="quick-prompts-wrapper">
                            <button class="quick-prompt-btn" data-prompt="Làm sao để chơi game Khủng Long đạt điểm kỷ lục trên 1000 điểm?">🎮 Mẹo đạt 1000+ điểm?</button>
                            <button class="quick-prompt-btn" data-prompt="Kể một câu chuyện cười ngắn vui vẻ">😄 Kể chuyện cười</button>
                            <button class="quick-prompt-btn" data-prompt="Bạn đang chạy bằng model AI nào trên máy tôi?">💻 Giới thiệu về bạn</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Footer / Input -->
            <div class="ai-chat-footer">
                <div class="ai-input-wrapper">
                    <textarea id="aiChatInput" class="ai-chat-input" rows="1" placeholder="Nhắn tin cho AI local (Enter để gửi)..."></textarea>
                    <button id="aiSendBtn" class="ai-send-btn" title="Gửi tin nhắn (Enter)">
                        <span class="send-icon">➤</span>
                    </button>
                </div>
                <div class="ai-footer-hint">
                    <span>⚡ AI chạy 100% Offline trên phần cứng máy bạn</span>
                </div>
            </div>
        `;
        document.body.appendChild(chatWindow);
    }

    // 2. Gán các sự kiện tương tác
    function bindChatEvents() {
        const fab = document.getElementById('aiChatFab');
        const win = document.getElementById('aiChatWindow');
        const closeBtn = document.getElementById('aiCloseBtn');
        const clearBtn = document.getElementById('aiClearBtn');
        const input = document.getElementById('aiChatInput');
        const sendBtn = document.getElementById('aiSendBtn');
        const modelSelect = document.getElementById('aiModelSelect');
        const chatBody = document.getElementById('aiChatBody');

        // Bật/Tắt chat window
        fab.addEventListener('click', toggleChat);
        closeBtn.addEventListener('click', toggleChat);

        // Bật/Tắt chế độ Nhanh vs Suy nghĩ sâu
        const modeToggleBtn = document.getElementById('aiModeToggleBtn');
        if (modeToggleBtn) {
            modeToggleBtn.addEventListener('click', () => {
                chatState.think = !chatState.think;
                if (chatState.think) {
                    modeToggleBtn.className = 'ai-mode-toggle-btn think';
                    modeToggleBtn.innerHTML = '<span class="mode-icon">🧠</span> <span class="mode-text">Suy nghĩ</span>';
                    appendSystemNotice('🧠 Đã bật chế độ <strong>Suy nghĩ sâu</strong> (phù hợp lập trình, toán học, giải đố phức tạp).');
                } else {
                    modeToggleBtn.className = 'ai-mode-toggle-btn fast';
                    modeToggleBtn.innerHTML = '<span class="mode-icon">⚡</span> <span class="mode-text">Nhanh</span>';
                    appendSystemNotice('⚡ Đã bật chế độ <strong>Trả lời nhanh</strong> (phản hồi trong 3-5 giây, không suy nghĩ lâu).');
                }
            });
        }

        const openBarBtn = document.getElementById('openAiChatBtn');
        if (openBarBtn) {
            openBarBtn.addEventListener('click', () => {
                if (!chatState.isOpen) toggleChat();
            });
        }

        // Bật/Tắt Cài đặt kết nối Tunnel Vercel
        const settingsBtn = document.getElementById('aiSettingsBtn');
        const settingsPanel = document.getElementById('aiSettingsPanel');
        const closeSettingsBtn = document.getElementById('aiCloseSettingsBtn');
        const tunnelInput = document.getElementById('aiTunnelInput');
        const saveTunnelBtn = document.getElementById('aiSaveTunnelBtn');
        const resetTunnelBtn = document.getElementById('aiResetTunnelBtn');

        const geminiKeyInput = document.getElementById('aiGeminiKeyInput');

        const DEFAULT_NGROK_URL = 'https://e6a0-116-99-255-211.ngrok-free.app';

        if (tunnelInput) {
            tunnelInput.value = localStorage.getItem('rex_ollama_tunnel') || DEFAULT_NGROK_URL;
        }

        if (settingsBtn && settingsPanel) {
            settingsBtn.addEventListener('click', () => {
                settingsPanel.classList.toggle('open');
            });
            if (closeSettingsBtn) {
                closeSettingsBtn.addEventListener('click', () => {
                    settingsPanel.classList.remove('open');
                });
            }
        }

        if (saveTunnelBtn) {
            saveTunnelBtn.addEventListener('click', () => {
                const tunnelVal = tunnelInput ? tunnelInput.value.trim().replace(/\/+$/, '') : '';
                if (tunnelVal) {
                    localStorage.setItem('rex_ollama_tunnel', tunnelVal);
                    appendSystemNotice(`🔗 Đã lưu link Ollama: <strong>${tunnelVal}</strong>`);
                } else {
                    localStorage.removeItem('rex_ollama_tunnel');
                }
                settingsPanel.classList.remove('open');
                fetchModels();
            });
        }

        if (resetTunnelBtn) {
            resetTunnelBtn.addEventListener('click', () => {
                localStorage.removeItem('rex_ollama_tunnel');
                if (tunnelInput) tunnelInput.value = DEFAULT_NGROK_URL;
                appendSystemNotice('↺ Đã đặt lại về link Ollama mặc định.');
                settingsPanel.classList.remove('open');
                fetchModels();
            });
        }

        // Đổi model
        modelSelect.addEventListener('change', (e) => {
            chatState.selectedModel = e.target.value;
            appendSystemNotice(`Đã chuyển sang mô hình: <strong>${chatState.selectedModel}</strong>`);
        });

        // Xóa lịch sử
        clearBtn.addEventListener('click', () => {
            if (confirm('Bạn có muốn xóa toàn bộ lịch sử trò chuyện không?')) {
                chatState.messages = [
                    {
                        role: 'system',
                        content: 'Bạn là T-Rex AI, một trợ lý thông minh và thân thiện được tích hợp trực tiếp trên web game Khủng Long (T-Rex Runner). Hãy trả lời bằng tiếng Việt tự nhiên, hữu ích, ngắn gọn và súc tích.'
                    }
                ];
                chatBody.innerHTML = `
                    <div class="ai-msg-bubble ai-msg-welcome">
                        <div class="msg-avatar">🦖</div>
                        <div class="msg-content">
                            <p>Cuộc trò chuyện mới đã bắt đầu! Hãy nhập câu hỏi của bạn bên dưới nhé.</p>
                        </div>
                    </div>
                `;
            }
        });

        // Tự động giãn dòng textarea & xử lý Enter gửi tin
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        sendBtn.addEventListener('click', sendMessage);

        // Click vào các câu hỏi gợi ý nhanh
        chatBody.addEventListener('click', (e) => {
            const promptBtn = e.target.closest('.quick-prompt-btn');
            if (promptBtn) {
                const promptText = promptBtn.getAttribute('data-prompt');
                if (promptText) {
                    input.value = promptText;
                    sendMessage();
                }
            }

            // Click vào tiêu đề "Suy nghĩ" để mở rộng / thu gọn
            const thinkingHeader = e.target.closest('.thinking-toggle-header');
            if (thinkingHeader) {
                const container = thinkingHeader.closest('.thinking-accordion');
                if (container) {
                    container.classList.toggle('expanded');
                }
            }
        });
    }

    // 3. Đóng mở cửa sổ Chat
    function toggleChat() {
        const win = document.getElementById('aiChatWindow');
        const fab = document.getElementById('aiChatFab');
        const input = document.getElementById('aiChatInput');

        chatState.isOpen = !chatState.isOpen;
        if (chatState.isOpen) {
            win.classList.add('open');
            fab.classList.add('active');
            setTimeout(() => input.focus(), 200);
        } else {
            win.classList.remove('open');
            fab.classList.remove('active');
        }
    }

    // 4. Lấy danh sách models từ Ollama qua API Server
    async function fetchModels() {
        const select = document.getElementById('aiModelSelect');
        const statusIndicator = document.getElementById('aiStatusIndicator');
        const statusBadge = document.getElementById('aiStatusBadge');

        try {
            const tunnelUrl = localStorage.getItem('rex_ollama_tunnel') || '';
            const headers = {};
            if (tunnelUrl) headers['x-ollama-url'] = tunnelUrl;

            const res = await fetch(getApiEndpoint('/api/ai/models'), { headers });
            const data = await res.json();

            if (data.success && Array.isArray(data.models) && data.models.length > 0) {
                chatState.availableModels = data.models;
                select.innerHTML = '';

                data.models.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.name;
                    opt.textContent = m.name;
                    if (m.name.includes('qwen-fast')) {
                        opt.selected = true;
                        chatState.selectedModel = m.name;
                    }
                    select.appendChild(opt);
                });

                if (!chatState.selectedModel && data.models[0]) {
                    chatState.selectedModel = data.models[0].name;
                }

                statusIndicator.className = 'ai-status-indicator online';
                statusIndicator.textContent = data.isVercel ? '● Online (Vercel)' : '● Online (Ollama)';
                statusBadge.className = 'fab-badge online';
                statusBadge.title = 'AI đã sẵn sàng trò chuyện!';
            } else {
                markOffline(data.error || 'Không tìm thấy model nào');
            }
        } catch (err) {
            markOffline('Chưa kết nối được với Ollama');
        }
    }

    function markOffline(msg) {
        const statusIndicator = document.getElementById('aiStatusIndicator');
        const statusBadge = document.getElementById('aiStatusBadge');
        if (statusIndicator) {
            statusIndicator.className = 'ai-status-indicator offline';
            statusIndicator.textContent = '○ Offline';
            statusIndicator.title = msg;
        }
        if (statusBadge) {
            statusBadge.className = 'fab-badge offline';
            statusBadge.title = msg;
        }
    }

    // 5. Gửi tin nhắn đến Server và nhận Stream
    async function sendMessage() {
        if (chatState.isGenerating) return;

        const input = document.getElementById('aiChatInput');
        const chatBody = document.getElementById('aiChatBody');
        const sendBtn = document.getElementById('aiSendBtn');
        const text = input.value.trim();

        if (!text) return;

        // Reset input
        input.value = '';
        input.style.height = 'auto';

        // 1. Thêm tin nhắn của User vào UI và State
        chatState.messages.push({ role: 'user', content: text });
        appendUserMessage(text);

        // 2. Tạo phần tử phản hồi của AI (gồm khối Thinking và Answer)
        const { msgElem, thinkingElem, thinkingContentElem, thinkingTimerElem, contentElem } = createAIMessageElement();
        chatBody.appendChild(msgElem);
        scrollToBottom();

        // 3. Trạng thái gửi
        chatState.isGenerating = true;
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<span class="loading-spinner"></span>';

        let fullThinking = '';
        let fullContent = '';
        let startTime = Date.now();
        let thinkingTimerInterval = null;

        if (chatState.think) {
            thinkingTimerInterval = setInterval(() => {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                if (thinkingTimerElem) {
                    thinkingTimerElem.textContent = `Suy nghĩ trong ${elapsed}s`;
                }
            }, 100);
        }

        try {
            const apiUrl = getApiEndpoint('/api/ai/chat');
            const tunnelUrl = localStorage.getItem('rex_ollama_tunnel') || 'https://e6a0-116-99-255-211.ngrok-free.app';
            const headers = { 'Content-Type': 'application/json' };
            if (tunnelUrl) headers['x-ollama-url'] = tunnelUrl;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    model: chatState.selectedModel,
                    messages: chatState.messages,
                    think: chatState.think,
                    ollamaUrl: tunnelUrl
                })
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error(`HTTP 404 (Không tìm thấy endpoint API). Vui lòng đảm bảo bạn đang mở web tại địa chỉ http://localhost:8080/ và đã chạy "node server.js"!`);
                }
                throw new Error(`HTTP error ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // giữ lại phần chưa hoàn chỉnh

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data:')) continue;

                    const dataStr = trimmed.replace(/^data:\s*/, '');
                    if (dataStr === '[DONE]') {
                        break;
                    }

                    try {
                        const parsed = JSON.parse(dataStr);
                        if (parsed.error) {
                            throw new Error(parsed.error);
                        }

                        // Xử lý stream thinking (nếu có)
                        if (parsed.message?.thinking) {
                            if (!thinkingElem.classList.contains('visible')) {
                                thinkingElem.classList.add('visible', 'expanded');
                            }
                            fullThinking += parsed.message.thinking;
                            thinkingContentElem.textContent = fullThinking;
                            scrollToBottom();
                        }

                        // Xử lý stream content thực tế
                        if (parsed.message?.content) {
                            // Khi bắt đầu có content, dừng đếm timer và tự động thu gọn thinking
                            if (thinkingTimerInterval) {
                                clearInterval(thinkingTimerInterval);
                                thinkingTimerInterval = null;
                                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                                if (thinkingTimerElem) {
                                    thinkingTimerElem.textContent = `Đã suy nghĩ xong (${elapsed}s)`;
                                }
                                thinkingElem.classList.remove('expanded');
                            }
                            fullContent += parsed.message.content;
                            contentElem.innerHTML = formatMarkdown(fullContent);
                            scrollToBottom();
                        }
                    } catch (parseErr) {
                        // Bỏ qua dòng JSON không hoàn chỉnh
                    }
                }
            }

            // Kết thúc streaming
            if (thinkingTimerInterval) {
                clearInterval(thinkingTimerInterval);
            }

            // Lưu phản hồi của AI vào lịch sử
            chatState.messages.push({
                role: 'assistant',
                content: fullContent
            });

        } catch (err) {
            console.error('[Chat Error]', err);
            contentElem.innerHTML = `
                <div class="ai-error-box">
                    <p><strong>⚠️ ${err.message}</strong></p>
                    <p style="margin-top: 6px; font-size: 11.5px; opacity: 0.9;">
                        💡 <strong>Khắc phục:</strong><br>
                        1. Đảm bảo bạn đang mở game bằng liên kết: <a href="http://localhost:8080/" style="color:#1a73e8;text-decoration:underline;font-weight:bold;">http://localhost:8080/</a><br>
                        2. Đảm bảo ứng dụng <strong>Ollama</strong> đang chạy trên máy và đã chạy <code>node server.js</code>.
                    </p>
                </div>
            `;
        } finally {
            if (thinkingTimerInterval) clearInterval(thinkingTimerInterval);
            chatState.isGenerating = false;
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<span class="send-icon">➤</span>';
            scrollToBottom();
        }
    }

    // Các hàm trợ giúp render DOM
    function appendUserMessage(text) {
        const chatBody = document.getElementById('aiChatBody');
        const bubble = document.createElement('div');
        bubble.className = 'ai-msg-bubble user';
        bubble.innerHTML = `
            <div class="msg-content">${escapeHTML(text)}</div>
        `;
        chatBody.appendChild(bubble);
        scrollToBottom();
    }

    function createAIMessageElement() {
        const bubble = document.createElement('div');
        bubble.className = 'ai-msg-bubble assistant';

        bubble.innerHTML = `
            <div class="msg-avatar">🦖</div>
            <div class="msg-content-wrapper">
                <!-- Khối hiển thị Quá trình suy nghĩ (Thinking) giống hệt Ollama -->
                <div class="thinking-accordion" id="thinkingAccordion">
                    <div class="thinking-toggle-header">
                        <span class="thinking-icon">🧠</span>
                        <span class="thinking-timer" id="thinkingTimer">Đang suy nghĩ...</span>
                        <span class="thinking-arrow">▾</span>
                    </div>
                    <div class="thinking-content" id="thinkingContent"></div>
                </div>

                <!-- Khối nội dung trả lời chính -->
                <div class="msg-main-content">
                    <span class="typing-indicator"><span>.</span><span>.</span><span>.</span></span>
                </div>
            </div>
        `;

        const thinkingElem = bubble.querySelector('.thinking-accordion');
        const thinkingContentElem = bubble.querySelector('.thinking-content');
        const thinkingTimerElem = bubble.querySelector('.thinking-timer');
        const contentElem = bubble.querySelector('.msg-main-content');

        return {
            msgElem: bubble,
            thinkingElem,
            thinkingContentElem,
            thinkingTimerElem,
            contentElem
        };
    }

    function appendSystemNotice(html) {
        const chatBody = document.getElementById('aiChatBody');
        const notice = document.createElement('div');
        notice.className = 'ai-system-notice';
        notice.innerHTML = html;
        chatBody.appendChild(notice);
        scrollToBottom();
    }

    function scrollToBottom() {
        const chatBody = document.getElementById('aiChatBody');
        if (chatBody) {
            chatBody.scrollTop = chatBody.scrollHeight;
        }
    }

    function escapeHTML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Trình phân tích cú pháp Markdown cơ bản
    function formatMarkdown(text) {
        if (!text) return '';
        let escaped = escapeHTML(text);

        // Code block: ```code```
        escaped = escaped.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

        // Inline code: `code`
        escaped = escaped.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

        // Bold: **text** hoặc __text__
        escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        escaped = escaped.replace(/__([^_]+)__/g, '<strong>$1</strong>');

        // Italic: *text* hoặc _text_
        escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        // Dòng mới chuyển thành <br>
        escaped = escaped.replace(/\n/g, '<br>');

        return escaped;
    }

})();
