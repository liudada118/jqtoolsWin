export const POINT_ITEM_OPTIONS = [
    { label: '坐垫', value: 'center' },
    { label: '靠背', value: 'centersit' },
    { label: '左侧翼', value: 'leftsit' },
    { label: '右侧翼', value: 'rightsit' },
];

const UNIT_SCALE = { x: 1, y: 1, z: 1 };

export const DEFAULT_SCENE_TRANSFORM = {
    overall: {
        x: 154,
        y: -62,
        z: -43,
        rotation: { x: -6.64, y: -6.86, z: -6.35 },
        scale: { ...UNIT_SCALE },
    },
    model: { x: 3, y: -112, z: 17, scale: { ...UNIT_SCALE } },
    points: { x: 0, y: 0, z: 0, scale: { ...UNIT_SCALE } },
    pointItems: {
        center: { x: -32, y: -28, z: 223, rotation: { x: -9.23, y: 0, z: 0 }, scale: { ...UNIT_SCALE } },
        leftsit: { x: -12, y: -1, z: 239.2, rotation: { x: -4.365, y: 0, z: 0 }, scale: { ...UNIT_SCALE } },
        rightsit: { x: -52, y: -1, z: 239.2, rotation: { x: -4.365, y: 0, z: 0 }, scale: { ...UNIT_SCALE } },
        centersit: { x: -20, y: 13, z: 250.5, rotation: { x: -4.365, y: 0, z: 0 }, scale: { x: 1.15, y: 1, z: 1 } },
    },
};

/**
 * 返回主副驾 Three.js 整体根分组的 X 轴缩放值。
 * 主驾保持原方向，副驾使用负缩放同步镜像座椅和全部压力点。
 */
export function getSensorViewScaleX(sensorId) {
    return Number(sensorId) === 2 ? -1 : 1;
}

/**
 * 将旧版统一缩放值或新版三轴缩放值转换为标准的 X/Y/Z 对象。
 * @param {number|object|undefined} value 待转换的缩放配置。
 * @param {object} fallback 缺失或无效轴使用的默认值。
 * @returns {{x: number, y: number, z: number}} 标准三轴缩放。
 */
export function normalizeSceneScale(value, fallback = UNIT_SCALE) {
    const source = Number.isFinite(value)
        ? { x: value, y: value, z: value }
        : value;

    return Object.fromEntries(['x', 'y', 'z'].map((axis) => {
        const candidate = Number(source?.[axis]);
        const fallbackValue = Number(fallback?.[axis]);
        return [
            axis,
            Number.isFinite(candidate) && candidate > 0
                ? candidate
                : (Number.isFinite(fallbackValue) && fallbackValue > 0 ? fallbackValue : 1),
        ];
    }));
}

/** 创建可修改的默认场景变换配置。 */
export function createDefaultSceneTransform() {
    return {
        overall: {
            ...DEFAULT_SCENE_TRANSFORM.overall,
            rotation: { ...DEFAULT_SCENE_TRANSFORM.overall.rotation },
            scale: { ...DEFAULT_SCENE_TRANSFORM.overall.scale },
        },
        model: {
            ...DEFAULT_SCENE_TRANSFORM.model,
            scale: { ...DEFAULT_SCENE_TRANSFORM.model.scale },
        },
        points: {
            ...DEFAULT_SCENE_TRANSFORM.points,
            scale: { ...DEFAULT_SCENE_TRANSFORM.points.scale },
        },
        pointItems: Object.fromEntries(
            Object.entries(DEFAULT_SCENE_TRANSFORM.pointItems).map(([name, item]) => [
                name,
                {
                    ...item,
                    rotation: { ...item.rotation },
                    scale: { ...item.scale },
                },
            ])
        ),
    };
}
