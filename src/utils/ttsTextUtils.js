/**
 * Chuẩn hóa văn bản tiếng Việt trước khi đưa vào VoiceStudio (OmniVoice) & tạo khóa Cache 1:1.
 * - Giữ nguyên 100% văn bản gốc có Emoji trên giao diện/phụ đề.
 * - Bản đưa vào TTS lọc sạch Emoji Unicode, ký tự trang trí và Việt hóa từ viết tắt
 *   ("🤖 Bot Cáo Đỏ" -> "Cáo Đỏ", "MVP" -> "ngôi vương xuất sắc nhất", "vote" -> "bỏ phiếu", "x2" -> "nhân hai")
 *   nhằm triệt tiêu hoàn toàn hiện tượng đọc lọt âm Tiếng Anh.
 */
export function normalizeTtsText(raw) {
  if (!raw || typeof raw !== "string") return "";
  let s = raw;

  // 1. Chuyển tên Bot có tiền tố "🤖 Bot Sói Xám" thành tên nhân vật thuần Việt "Sói Xám"
  s = s.replace(/🤖\s*Bots?\s+/giu, "");

  // 2. Loại bỏ toàn bộ Emoji Unicode, cờ tổ hợp và ký tự điều khiển biến thể
  s = s.replace(/[\p{Extended_Pictographic}\uFE00-\uFE0F\u200D]/gu, " ");

  // 3. Loại bỏ dấu ngoặc vuông bao quanh tên nhân vật (VD: [Hùng] -> Hùng)
  s = s.replace(/[\[\]]/g, "");

  // 4. Việt hóa các từ tiếng Anh / viết tắt phổ biến trong thông báo MC & Recap
  s = s.replace(/\bAI\s*Bots?\b/gi, "người máy");
  s = s.replace(/\bBots?\b/gi, "người máy");
  s = s.replace(/\bMVP\b/gi, "ngôi vương xuất sắc nhất");
  s = s.replace(/\bvote\b/gi, "bỏ phiếu");
  s = s.replace(/\bx2\b/gi, "nhân hai");
  s = s.replace(/\bvs\b/gi, "đối đầu");

  // 5. Làm mượt dấu câu để ngắt nghỉ giọng đọc tự nhiên
  s = s.replace(/[—–•]/g, ", ");
  s = s.replace(/!{2,}/g, "!");
  s = s.replace(/\.{3,}/g, ".");
  s = s.replace(/\s+([,.;:!?])/g, "$1");
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

export function getTtsCacheKey(raw) {
  return normalizeTtsText(raw).toLowerCase();
}
