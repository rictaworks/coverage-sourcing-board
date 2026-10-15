'use client';

import { useId, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { PREPARE_DEFAULTS } from '../../../config/defaults';
import { PREPARE_STRINGS } from '../../../config/strings/prepare';
import { cropRectAt, positionFromPointer } from '../../lib/image/cropMath';
import styles from './prepare.module.css';

/**
 * 4:3 のトリミング枠。ドラッグとスライダー（キーボードの矢印キーを含む）で位置を動かします。
 * 比率が幅の広い画像は左右、縦の広い画像は上下に動きます。
 */
export function CropFrame({
  imageUrl,
  width,
  height,
  position,
  onPositionChange,
}: {
  readonly imageUrl: string;
  readonly width: number;
  readonly height: number;
  readonly position: number;
  readonly onPositionChange: (position: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const rangeId = useId();
  const crop = cropRectAt(width, height, position);
  const horizontal = crop.width < width;
  const frameLeft = (crop.x / width) * 100;
  const frameTop = (crop.y / height) * 100;
  const frameWidth = (crop.width / width) * 100;
  const frameHeight = (crop.height / height) * 100;
  const percent = Math.round(position * 100);

  /** ポインターの位置（枠の中心）から、枠の位置を求めます。 */
  const handlePointer = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const track = trackRef.current;
    if (track === null) {
      return;
    }
    const rect = track.getBoundingClientRect();
    const frameSize = horizontal ? (frameWidth / 100) * rect.width : (frameHeight / 100) * rect.height;
    const pointer = horizontal ? event.clientX - rect.left : event.clientY - rect.top;
    const trackSize = horizontal ? rect.width : rect.height;
    onPositionChange(positionFromPointer(pointer, trackSize, frameSize));
  };

  return (
    <div className={styles.cropArea}>
      <div ref={trackRef} className={styles.cropTrack}>
        <img src={imageUrl} alt={PREPARE_STRINGS.cropFrameLabel} className={styles.cropImage} draggable={false} />
        <div
          className={styles.cropFrame}
          style={{
            left: `${frameLeft}%`,
            top: `${frameTop}%`,
            width: `${frameWidth}%`,
            height: `${frameHeight}%`,
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            handlePointer(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              handlePointer(event);
            }
          }}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
        />
      </div>
      <label htmlFor={rangeId} className={styles.help}>
        {PREPARE_STRINGS.cropRangeLabel}
      </label>
      <input
        id={rangeId}
        type="range"
        min={0}
        max={100}
        step={PREPARE_DEFAULTS.cropStepPercent}
        value={percent}
        aria-valuetext={PREPARE_STRINGS.cropValueText(percent)}
        className={styles.range}
        onChange={(event) => onPositionChange(Number(event.currentTarget.value) / 100)}
      />
      <p className={styles.help}>{PREPARE_STRINGS.cropHelp}</p>
    </div>
  );
}
