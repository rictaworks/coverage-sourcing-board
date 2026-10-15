/**
 * 地点の定数（四国の県庁所在地）。昼間の判定に使います（requirements 3.3）。
 * 市町村の境界データは未確認のため（requirements 12.5）、撮影地はここの座標で照合しません。
 * 座標は市役所の概略の値です。国立天文台の暦計算室の表示値（0.05 度単位）と整合することを確認しています（SPEC/validation.md）。
 */

/** 日本時間の時差（分）。EXIF に時差（OffsetTimeOriginal）が無いときの既定値です。 */
export const JST_OFFSET_MINUTES = 540;

/** 地点（名称と緯度・経度。経度は東経を正とします）。 */
export interface GeoPoint {
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
}

/** 昼間の判定に使う県庁所在地。判定は、いずれかの地点で昼間なら昼間とします（SPEC/validation.md）。 */
export const PREFECTURAL_CAPITALS: readonly GeoPoint[] = [
  { name: '徳島市', lat: 34.0658, lng: 134.5593 },
  { name: '高松市', lat: 34.3428, lng: 134.0466 },
  { name: '松山市', lat: 33.8416, lng: 132.7657 },
  { name: '高知市', lat: 33.5597, lng: 133.5311 },
];
