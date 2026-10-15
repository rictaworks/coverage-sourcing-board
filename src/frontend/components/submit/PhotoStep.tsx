'use client';

import { useEffect, useRef, useState } from 'react';
import { PREPARE_ERROR_STRINGS, PREPARE_STRINGS } from '../../../config/strings/prepare';
import { SUBMIT_STRINGS } from '../../../config/strings/submit';
import { ErrorMessage } from '../common/ErrorMessage';
import { CropFrame } from '../prepare/CropFrame';
import { ImagePicker } from '../prepare/ImagePicker';
import { PreparedPreview } from '../prepare/PreparedPreview';
import { ImagePrepareError, ImagePreparer, type PreparedImage, type SourceImage } from '../../lib/image/preparedImage';
import styles from './submit.module.css';

/** 画面の段階。idle は未選択、ready は枠を確定できる状態、done は整形が終わった状態です。 */
type Phase = 'idle' | 'analyzing' | 'ready' | 'preparing' | 'done';

/**
 * 写真の段階（選ぶ・枠を決める・確定）。確定した結果を親へ渡し、判定と送信は親の画面が行います（D4）。
 * 整形の処理は D3 の ImagePreparer と部品（ImagePicker・CropFrame・PreparedPreview）をそのまま使います。
 */
export function PhotoStep({ onPreparedChange }: { readonly onPreparedChange: (prepared: PreparedImage | null) => void }) {
  const preparerRef = useRef<ImagePreparer | null>(null);
  if (preparerRef.current === null) {
    preparerRef.current = new ImagePreparer();
  }
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<SourceImage | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [position, setPosition] = useState(0.5);
  const [prepared, setPrepared] = useState<PreparedImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (sourceUrl !== null) {
        URL.revokeObjectURL(sourceUrl);
      }
    };
  }, [sourceUrl]);

  useEffect(() => {
    return () => {
      if (previewUrl !== null) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const preparer = preparerRef.current;

  const reset = (): void => {
    if (source !== null) {
      preparer.release(source);
    }
    setSource(null);
    setSourceUrl(null);
    setPrepared(null);
    setPreviewUrl(null);
    setPosition(0.5);
    setError(null);
    setPhase('idle');
    onPreparedChange(null);
  };

  const handleSelect = async (file: File): Promise<void> => {
    if (source !== null) {
      preparer.release(source);
    }
    setError(null);
    setPrepared(null);
    setPreviewUrl(null);
    setSource(null);
    setPosition(0.5);
    onPreparedChange(null);
    setPhase('analyzing');
    try {
      const analyzed = await preparer.analyze(file);
      setSource(analyzed);
      setSourceUrl(URL.createObjectURL(file));
      setPhase('ready');
    } catch (caught) {
      setPhase('idle');
      setError(describeError(caught));
    }
  };

  const handleConfirm = async (): Promise<void> => {
    if (source === null) {
      return;
    }
    setError(null);
    setPhase('preparing');
    try {
      const result = await preparer.prepare(source, position);
      preparer.release(source);
      setSource(null);
      setPreviewUrl(URL.createObjectURL(result.saved.blob));
      setPrepared(result);
      setPhase('done');
      onPreparedChange(result);
    } catch (caught) {
      setPhase('ready');
      setError(describeError(caught));
    }
  };

  const busy = phase === 'analyzing' || phase === 'preparing';

  return (
    <section className={styles.block} aria-labelledby="photo-heading" aria-busy={busy}>
      <h2 id="photo-heading" className={styles.heading}>
        {SUBMIT_STRINGS.photoHeading}
      </h2>
      <p className={styles.help}>{PREPARE_STRINGS.intro}</p>

      {error !== null ? <ErrorMessage message={error} /> : null}

      {phase === 'idle' || phase === 'analyzing' ? (
        <ImagePicker disabled={busy} onSelect={(file) => void handleSelect(file)} />
      ) : null}
      {phase === 'analyzing' ? <p role="status">{PREPARE_STRINGS.analyzing}</p> : null}

      {source !== null && sourceUrl !== null && phase === 'ready' ? (
        <section className={styles.subBlock} aria-labelledby="crop-heading">
          <h3 id="crop-heading" className={styles.subHeading}>
            {PREPARE_STRINGS.cropHeading}
          </h3>
          {source.needsCrop ? (
            <CropFrame
              imageUrl={sourceUrl}
              width={source.width}
              height={source.height}
              position={position}
              onPositionChange={setPosition}
            />
          ) : (
            <p className={styles.help}>{PREPARE_STRINGS.cropNotNeeded}</p>
          )}
          <button type="button" className={styles.button} onClick={() => void handleConfirm()}>
            {PREPARE_STRINGS.confirmButton}
          </button>
        </section>
      ) : null}

      {phase === 'preparing' ? <p role="status">{PREPARE_STRINGS.preparing}</p> : null}

      {prepared !== null && previewUrl !== null && phase === 'done' ? (
        <section className={styles.subBlock} aria-labelledby="preview-heading">
          <h3 id="preview-heading" className={styles.subHeading}>
            {PREPARE_STRINGS.previewHeading}
          </h3>
          <PreparedPreview prepared={prepared} previewUrl={previewUrl} />
        </section>
      ) : null}

      {phase === 'ready' || phase === 'done' ? (
        <button type="button" className={styles.secondaryButton} onClick={reset}>
          {PREPARE_STRINGS.resetButton}
        </button>
      ) : null}
    </section>
  );
}

/** 整形の例外は理由の文言を返します。それ以外の例外は、予期しない失敗の文言にします（原因は推定しません）。 */
function describeError(caught: unknown): string {
  if (caught instanceof ImagePrepareError) {
    return caught.message;
  }
  return PREPARE_ERROR_STRINGS.unexpected;
}
