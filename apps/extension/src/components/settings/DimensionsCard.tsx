import { useEffect, useRef, useState } from 'react';
import { type Dimension, type Taxonomy } from '@x-threadpick/shared';
import { addTaxonomyValue, getTaxonomy, removeTaxonomyValue } from '../../db/taxonomy';

interface DimensionMeta {
  key: Dimension;
  name: string;
  en: string;
  question: string;
  mode: '多选' | '单选';
}

/** 维度固定四个（产品决策）；状态为单选、取值间无流转语义（2026-09 修订）。 */
const DIMENSION_META: readonly DimensionMeta[] = [
  { key: 'topic', name: '主题', en: 'Topic', question: '它讲什么？', mode: '多选' },
  { key: 'type', name: '形态', en: 'Type', question: '它是什么？', mode: '多选' },
  { key: 'purpose', name: '用途', en: 'Purpose', question: '我拿它干什么？', mode: '多选' },
  { key: 'status', name: '状态', en: 'Status', question: '我处理到哪了？', mode: '单选' },
];

const INPUT_PLACEHOLDER: Record<Dimension, string> = {
  topic: '新主题…',
  type: '新形态…',
  purpose: '新用途…',
  status: '新状态…',
};

type ErrorMap = Record<Dimension, string | null>;

const NO_ERRORS: ErrorMap = { topic: null, type: null, purpose: null, status: null };
const EMPTY_INPUTS: Record<Dimension, string> = {
  topic: '',
  type: '',
  purpose: '',
  status: '',
};

export default function DimensionsCard() {
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [inputs, setInputs] = useState<Record<Dimension, string>>({ ...EMPTY_INPUTS });
  const [errors, setErrors] = useState<ErrorMap>({ ...NO_ERRORS });
  const inputRefs = useRef<Partial<Record<Dimension, HTMLInputElement | null>>>({});

  useEffect(() => {
    getTaxonomy()
      .then(setTaxonomy)
      .catch((err: unknown) => console.error('[settings] 加载分类维度失败', err));
  }, []);

  const add = (dimension: Dimension): void => {
    addTaxonomyValue(dimension, inputs[dimension] ?? '')
      .then(async (result) => {
        if (result.status === 'added') {
          setTaxonomy(await getTaxonomy());
          setInputs((prev) => ({ ...prev, [dimension]: '' }));
          setErrors((prev) => ({ ...prev, [dimension]: null }));
          inputRefs.current[dimension]?.focus();
        } else if (result.reason === 'duplicate') {
          setErrors((prev) => ({ ...prev, [dimension]: '该取值已存在' }));
        } else if (result.reason === 'too_long') {
          setErrors((prev) => ({ ...prev, [dimension]: '取值过长' }));
        }
        // reason === 'empty'：静默不添加（feat06 场景2）
      })
      .catch((err: unknown) => console.error('[settings] 添加取值失败', err));
  };

  const remove = (dimension: Dimension, value: string): void => {
    removeTaxonomyValue(dimension, value)
      .then(async (result) => {
        if (result.status === 'removed') {
          setTaxonomy(await getTaxonomy());
          setErrors((prev) => ({ ...prev, [dimension]: null }));
        } else if (result.reason === 'protected') {
          setErrors((prev) => ({ ...prev, [dimension]: '默认状态不可删除' }));
        } else {
          setTaxonomy(await getTaxonomy());
        }
      })
      .catch((err: unknown) => console.error('[settings] 删除取值失败', err));
  };

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title serif">
          分类维度<span className="en">Dimensions</span>
        </div>
      </div>
      <p className="card-desc">同一份书签，从四个角度找回。维度固定，取值完全由你定义。</p>

      {taxonomy === null ? (
        <p className="loading">正在载入分类维度…</p>
      ) : (
        <div className="dim-grid">
          {DIMENSION_META.map((meta) => (
            <div key={meta.key} className={`dim${meta.key === 'status' ? ' dim-wide' : ''}`}>
              <div className="dim-head">
                <div className="dim-name">
                  {meta.name}
                  <span className="en">{meta.en}</span>
                </div>
                <span className={`dim-mode${meta.key === 'status' ? ' neutral' : ''}`}>
                  {meta.mode}
                </span>
              </div>
              <p className="dim-q">{meta.question}</p>
              <div className="chips">
                {taxonomy[meta.key].map((value) => (
                  <span
                    key={value}
                    className={`chip${meta.key === 'status' ? ' status-chip' : ''}`}
                  >
                    {value}
                    <button
                      type="button"
                      className="x"
                      aria-label={`删除取值 ${value}`}
                      onClick={() => remove(meta.key, value)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="chip-add">
                <input
                  type="text"
                  placeholder={INPUT_PLACEHOLDER[meta.key]}
                  aria-label={`新${meta.name}取值`}
                  value={inputs[meta.key]}
                  onChange={(e) => {
                    const value = e.target.value;
                    setInputs((prev) => ({ ...prev, [meta.key]: value }));
                    if (errors[meta.key] !== null) {
                      setErrors((prev) => ({ ...prev, [meta.key]: null }));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') add(meta.key);
                  }}
                  ref={(el) => {
                    inputRefs.current[meta.key] = el;
                  }}
                />
                <button
                  type="button"
                  title="添加"
                  aria-label={`添加${meta.name}取值`}
                  onClick={() => add(meta.key)}
                >
                  +
                </button>
              </div>
              {errors[meta.key] !== null && <p className="dim-error">{errors[meta.key]}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="dim-note">
        新收藏默认进入 <b>Inbox</b>
        ，四个维度都允许后补。删除某个取值不会影响书签本身，只会移除该属性标记。
      </div>
    </section>
  );
}
