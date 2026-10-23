/**
 * Hằng số chuẩn hóa không gian 3D (đơn vị: mét) — Khớp 1:1 với quy chuẩn Blender & Mixamo:
 * - Chiều cao nhân vật đứng: 1.75m (gốc (0,0,0) giữa hai bàn chân)
 * - Chiều cao mặt ghế ngồi: y = 0.48m
 */
export const SEAT_TOP_Y = 0.48;
export const CHARACTER_HEIGHT = 1.75;

/**
 * Bán kính vòng ghế tự động co giãn theo tổng số người chơi (6..18 người)
 * để các ghế không bao giờ đè lên nhau và Camera qua vai luôn nhìn trọn vòng tròn.
 */
export function computeCircleRadius(numPlayers = 6) {
  const count = Math.max(6, numPlayers);
  return Math.max(3.6, Math.min(6.4, count * 0.48));
}

/**
 * Tính tọa độ (x, z) và góc xoay hướng vào đống lửa trung tâm (0, 0, 0) cho từng ghế.
 */
export function getSeatTransform(seatIdx, numPlayers, radiusOverride) {
  const total = Math.max(1, numPlayers || 6);
  const radius = radiusOverride ?? computeCircleRadius(total);
  // Xếp đều theo vòng tròn bắt đầu từ góc +Z (phía Nam hướng về Bắc) để ghế 0 có hướng trực quan
  const angle = (seatIdx / total) * Math.PI * 2;
  const x = Math.sin(angle) * radius;
  const z = Math.cos(angle) * radius;
  // Nhân vật nhìn thẳng về tâm (0, 0, 0) -> vector (-x, -z)
  const facingYaw = Math.atan2(-x, -z);

  return {
    seatIdx,
    x,
    z,
    radius,
    angle,
    facingYaw,
  };
}
