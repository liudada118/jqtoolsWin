import { createDefaultSceneTransform } from './sceneTransform';

describe('靠背点图默认变换', () => {
    test('使用现场标定的位置、旋转和方向缩放', () => {
        const transform = createDefaultSceneTransform();

        expect(transform.pointItems.centersit).toEqual({
            x: -20,
            y: 13,
            z: 250.5,
            rotation: { x: -4.365, y: 0, z: 0 },
            scale: { x: 1.15, y: 1, z: 1 },
        });

        expect(transform.overall).toEqual({
            x: 154,
            y: -62,
            z: -43,
            rotation: { x: -6.64, y: -6.86, z: -6.35 },
            scale: { x: 1, y: 1, z: 1 },
        });
    });
});
