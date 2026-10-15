'use client';

import { useEffect, useRef, useState } from 'react';
import { PREPARE_ERROR_STRINGS, PREPARE_STRINGS } from '../../../config/strings/prepare';
import { ErrorMessage } from '../common/ErrorMessage';
import { ImagePrepareError, ImagePreparer, type PreparedImage, type SourceImage } from '../../lib/image/preparedImage';
import { CropFrame } from './CropFrame';
import { ImagePicker } from './ImagePicker';
import { PreparedPreview } from './PreparedPreview';
import styles from './prepare.module.css';

/** 画面の段階。idle は未選択、ready は確定できる状態です。 */
type Phase = 'idle' | 'analyzing' | 'ready' | 'preparing' | 'done';

/** 画像の整形の手順（選ぶ・枠・確定・確かめる）。入力欄と判定と送信は後続の Issue が足します。 */
export function PrepareFlow() {
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

  /** 画面を離れるときに、一時的な URL を解放します。 */
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
    } catch (caught) {
      setPhase('ready');
      setError(describeError(caught));
    }
  };

  const busy = phase === 'analyzing' || phase === 'preparing';

  return (
    <section className={styles.flow} aria-busy={busy}>
      <p>{PREPARE_STRINGS.intro}</p>
      <ol className={styles.steps}>
        {PREPARE_STRINGS.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className={styles.help}>{PREPARE_STRINGS.privacyNote}</p>

      {error !== null ? <ErrorMessage message={error} /> : null}

      {phase === 'idle' || phase === 'analyzing' ? (
        <ImagePicker disabled={busy} onSelect={(file) => void handleSelect(file)} />
      ) : null}
      {phase === 'analyzing' ? <p role="status">{PREPARE_STRINGS.analyzing}</p> : null}

      {source !== null && sourceUrl !== null && phase === 'ready' ? (
        <section className={styles.block} aria-labelledby="crop-heading">
          <h2 id="crop-heading" className={styles.heading}>
            {PREPARE_STRINGS.cropHeading}
          </h2>
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
        <section className={styles.block} aria-labelledby="preview-heading">
          <h2 id="preview-heading" className={styles.heading}>
            {PREPARE_STRINGS.previewHeading}
          </h2>
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

