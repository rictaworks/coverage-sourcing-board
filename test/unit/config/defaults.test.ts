import { describe, expect, it } from 'vitest';
import { RULE_DEFAULTS } from '../../../src/config/defaults';
import { LIMITS } from '../../../src/config/limits';

describe('RULE_DEFAULTS（requirements 3.0 の既定値）', () => {
  it('アスペクト比 4:3、許容誤差 1%、横向きのみ', () => {
    expect(RULE_DEFAULTS.aspectRatio).toEqual({ width: 4, height: 3 });
    expect(RULE_DEFAULTS.aspectTolerance).toBe(0.01);
    expect(RULE_DEFAULTS.orientation).toBe('landscape');
  });

  it('入力ファイルは 5 MB 以下、入力画素数は 4,000 万画素以下、最小短辺は 800 px', () => {
    expect(RULE_DEFAULTS.maxInputBytes).toBe(5 * 1024 * 1024);
    expect(RULE_DEFAULTS.maxInputPixels).toBe(40_000_000);
    expect(RULE_DEFAULTS.minShortSidePx).toBe(800);
  });

  it('JPEG 品質は 50 未満が不合格、60 未満が要確認', () => {
    expect(RULE_DEFAULTS.jpegQualityFail).toBe(50);
    expect(RULE_DEFAULTS.jpegQualityReview).toBe(60);
  });

  it('ピントは 30 未満が不合格、60 未満が要確認', () => {
    expect(RULE_DEFAULTS.focusFail).toBe(30);
    expect(RULE_DEFAULTS.focusReview).toBe(60);
  });

  it('平均輝度 40 未満は要確認、知覚ハッシュの距離は 4 以下が不合格、8 以下が要確認', () => {
    expect(RULE_DEFAULTS.dimLumaReview).toBe(40);
    expect(RULE_DEFAULTS.phashDuplicateMax).toBe(4);
    expect(RULE_DEFAULTS.phashReviewMax).toBe(8);
  });

  it('分類の確信度 0.6、保存画像は長辺 1,600 px・1,900,000 バイト、分類用の縮小は 512 px', () => {
    expect(RULE_DEFAULTS.classifyConfidenceMin).toBe(0.6);
    expect(RULE_DEFAULTS.savedLongEdgePx).toBe(1600);
    expect(RULE_DEFAULTS.savedMaxBytes).toBe(1_900_000);
    expect(RULE_DEFAULTS.classifyImageEdgePx).toBe(512);
  });

  it('加工の偏りの閾値は仮の値として存在します（実測で調整します）', () => {
    expect(RULE_DEFAULTS.saturationReviewMin).toBeLessThan(RULE_DEFAULTS.saturationReviewMax);
    expect(RULE_DEFAULTS.contrastReviewMin).toBeLessThan(RULE_DEFAULTS.contrastReviewMax);
  });
});

describe('LIMITS（requirements 3.8 と入力の上限）', () => {
  it('IP ごとに 10 秒で 5 回まで', () => {
    expect(LIMITS.rateLimitRequests).toBe(5);
    expect(LIMITS.rateLimitWindowSeconds).toBe(10);
  });

  it('セッションごとに 1 日 20 件まで、保存中の投稿は全体で 200 件まで', () => {
    expect(LIMITS.dailySubmissionsPerSession).toBe(20);
    expect(LIMITS.maxSavedSubmissions).toBe(200);
  });

  it('分類は全体で 1 日 2,000 回まで', () => {
    expect(LIMITS.dailyClassifyCalls).toBe(2000);
  });

  it('地点名は 20 字、説明文は 60 字まで', () => {
    expect(LIMITS.spotNameMaxChars).toBe(20);
    expect(LIMITS.captionMaxChars).toBe(60);
  });

  it('差し戻しの理由と分類用の縮小画像の上限が存在します（仮の値）', () => {
    expect(LIMITS.returnReasonMaxChars).toBeGreaterThan(0);
    expect(LIMITS.classifyImageMaxBytes).toBeGreaterThan(0);
  });
});
