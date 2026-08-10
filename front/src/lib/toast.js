import Toastify from 'toastify-js';
import 'toastify-js/src/toastify.css';

export function showToast(message) {
    let background = "#3b82f6"; // default blue
    if (typeof message === "string" && (message.includes("失败") || message.includes("出错") || message.includes("Failed"))) {
        background = "#ef4444"; // red for errors
    } else if (typeof message === "string" && (message.includes("成功") || message.includes("已复制"))) {
        background = "#22c55e"; // green for success
    } else {
        background = "#3f3f46"; // default dark/grayish
    }
    
    Toastify({
        text: message,
        duration: 3000,
        gravity: "top", 
        position: "center", 
        stopOnFocus: true,
        style: {
            background: background,
            borderRadius: "8px",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
            fontSize: "14px"
        }
    }).showToast();
}
