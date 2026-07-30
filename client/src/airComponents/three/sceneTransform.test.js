import {
    createDefaultSceneTransform,
    getSensorViewScaleX,
    normalizeSceneScale,
} from './sceneTransform';

describe('汽车主副驾完全对称视图', () => {
    test('主驾保持整体根分组原方向', () => {
        expect(getSensorViewScaleX(1)).toBe(1);
    });

    test('副驾水平镜像包含模型和点图的整体根分组', () => {
        expect(getSensorViewScaleX(2)).toBe(-1);
    });

    test('未知标识按主驾方向处理', () => {
        expect(getSensorViewScaleX(undefined)).toBe(1);
    });
});

describe('汽车视图三轴缩放', () => {
    test('旧版统一缩放值迁移为三个相同轴值', () => {
        expect(normalizeSceneScale(1.5)).toEqual({ x: 1.5, y: 1.5, z: 1.5 });
    });

    test('新版缩放对象保留有效轴并补齐缺失轴', () => {
        expect(normalizeSceneScale({ x: 1.2, z: 0.8 })).toEqual({
            x: 1.2,
            y: 1,
            z: 0.8,
        });
    });

    test('四类默认变换均提供独立三轴缩放对象', () => {
        const transform = createDefaultSceneTransform();

        expect(transform.overall.scale).toEqual({ x: 1, y: 1, z: 1 });
        expect(transform.model.scale).toEqual({ x: 1, y: 1, z: 1 });
        expect(transform.points.scale).toEqual({ x: 1, y: 1, z: 1 });
        expect(transform.pointItems.center.scale).toEqual({ x: 1, y: 1, z: 1 });

        transform.overall.scale.x = 2;
        expect(transform.model.scale.x).toBe(1);
    });
});
