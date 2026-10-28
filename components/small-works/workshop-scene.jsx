'use client';

import { useEffect, useRef, useState } from 'react';
import { t } from '@/lib/i18n';

/** A presentation-only workshop. The parent owns focus time and craft progress. */
export function WorkshopScene({
  activity = 'idle',
  progress = 0,
  motion = 'full',
  expanded = false,
  crew = [],
  joinery = false,
  forge = false,
  yard = false,
  greenhouse = null,
  patternId = 'plain',
  finishStyleId = 'natural',
  recipeId = 'stool',
  mainStageId,
  stageProgress,
  locale = 'en',
  label,
  onUnavailable,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const currentRef = useRef({ activity, progress, motion, expanded, crew, joinery, forge, yard, greenhouse, patternId, finishStyleId, recipeId, mainStageId, stageProgress, onUnavailable });
  const [unavailable, setUnavailable] = useState(false);
  currentRef.current = { activity, progress, motion, expanded, crew, joinery, forge, yard, greenhouse, patternId, finishStyleId, recipeId, mainStageId, stageProgress, onUnavailable };

  useEffect(() => {
    let cancelled = false;
    function reportUnavailable(error) {
      if (cancelled) return;
      setUnavailable(true);
      currentRef.current.onUnavailable?.(error);
    }
    // Load only in the browser; no GPU work or scene code runs during SSR.
    import('@/lib/scene/workshop').then(({ initializeWorkshopScene }) => {
      if (cancelled) return;
      try {
        const scene = initializeWorkshopScene({
          canvas: canvasRef.current,
          container: containerRef.current,
          ...currentRef.current,
          onUnavailable: reportUnavailable,
        });
        if (cancelled) scene.dispose();
        else sceneRef.current = scene;
      } catch (error) {
        reportUnavailable(error);
      }
    }).catch(reportUnavailable);
    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.update({ activity, progress, motion, expanded, crew, joinery, forge, yard, greenhouse, patternId, finishStyleId, recipeId, mainStageId, stageProgress });
  }, [activity, progress, motion, expanded, crew, joinery, forge, yard, greenhouse, patternId, finishStyleId, recipeId, mainStageId, stageProgress]);

  const sceneLabel = label || t('smallWorks.scene.label', locale);
  return (
    <div className="sw-scene" ref={containerRef} data-motion={motion} data-expanded={expanded}
      data-scene-activity={activity} data-scene-progress={progress} data-scene-recipe={recipeId ?? 'none'}
      data-scene-yard={yard} data-scene-greenhouse={greenhouse?.status || 'none'}
      data-scene-pattern={patternId} data-scene-finish={finishStyleId}
      data-scene-joinery={joinery} data-scene-forge={forge} data-scene-stage={mainStageId}
      data-scene-crew={crew.filter(member => member?.status === 'active' && member.staffId !== 'maker').map(member => `${member.staffId}:${member.activity || 'idle'}:${member.recipeId || (['blacksmith', 'carver', 'finisher'].includes(member.staffId) ? 'none' : 'stool')}${member.stageId ? `:${member.stageId}` : ''}`).join(',')}>
      <canvas ref={canvasRef} aria-label={sceneLabel} role="img" hidden={unavailable} />
      {unavailable && (
        <div className="sw-scene-fallback" role="status">
          <p>{sceneLabel}</p>
          <p>{t('smallWorks.scene.unavailable', locale)}</p>
        </div>
      )}
    </div>
  );
}

export default WorkshopScene;
