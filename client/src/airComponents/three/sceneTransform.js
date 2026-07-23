export const POINT_ITEM_OPTIONS = [
    { label: '坐垫', value: 'center' },
    { label: '靠背', value: 'centersit' },
    { label: '左侧翼', value: 'leftsit' },
    { label: '右侧翼', value: 'rightsit' },
];

export const DEFAULT_SCENE_TRANSFORM = {
    overall: { x: 167, y: -36, z: -69, rotation: { x: -6.5, y: -6.9, z: -6.35 } },
    model: { x: 3, y: -112, z: 17 },
    points: { x: 0, y: 0, z: 0, scale: 1 },
    pointItems: {
        center: { x: -32, y: -28, z: 223, rotation: { x: -9.23, y: 0, z: 0 }, scale: 1 },
        leftsit: { x: -12, y: -1, z: 239.2, rotation: { x: -4.365, y: 0, z: 0 }, scale: 1 },
        rightsit: { x: -52, y: -1, z: 239.2, rotation: { x: -4.365, y: 0, z: 0 }, scale: 1 },
        centersit: { x: -21, y: 13, z: 252, rotation: { x: -4.365, y: 0, z: 0 }, scale: 1 },
    },
};

/** 创建可修改的默认场景变换配置。 */
export function createDefaultSceneTransform() {
    return {
        overall: {
            ...DEFAULT_SCENE_TRANSFORM.overall,
            rotation: { ...DEFAULT_SCENE_TRANSFORM.overall.rotation },
        },
        model: { ...DEFAULT_SCENE_TRANSFORM.model },
        points: { ...DEFAULT_SCENE_TRANSFORM.points },
        pointItems: Object.fromEntries(
            Object.entries(DEFAULT_SCENE_TRANSFORM.pointItems).map(([name, item]) => [
                name,
                { ...item, rotation: { ...item.rotation } },
            ])
        ),
    };
}
