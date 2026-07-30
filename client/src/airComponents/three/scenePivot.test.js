import * as THREE from 'three';
import {
    getObjectBoundsCenterInAncestor,
    getOverallPivotOffset,
} from './scenePivot';

describe('整体视图座椅中心枢轴', () => {
    test('计算模型在内容组局部坐标系中的包围盒中心', () => {
        const ancestor = new THREE.Group();
        ancestor.position.set(30, -20, 10);
        ancestor.rotation.set(0.2, -0.3, 0.1);

        const object = new THREE.Group();
        object.position.set(5, 6, 7);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6));
        mesh.position.set(1, 2, 3);
        object.add(mesh);
        ancestor.add(object);

        const center = getObjectBoundsCenterInAncestor(object, ancestor);

        expect(center.x).toBeCloseTo(6);
        expect(center.y).toBeCloseTo(8);
        expect(center.z).toBeCloseTo(10);
    });

    test('枢轴补偿遵循整体视图的三轴缩放和旋转', () => {
        const offset = getOverallPivotOffset(
            new THREE.Vector3(1, 2, 3),
            new THREE.Vector3(4, 6, 3),
            { x: 0, y: 0, z: Math.PI / 2 },
            { x: 2, y: 1, z: 1 }
        );

        expect(offset.x).toBeCloseTo(-4);
        expect(offset.y).toBeCloseTo(6);
        expect(offset.z).toBeCloseTo(0);
    });

    test('首次建立中心枢轴时保持当前模型画面位置', () => {
        const center = new THREE.Vector3(12, -4, 8);
        const point = new THREE.Vector3(20, 10, 3);
        const rotation = { x: -0.4, y: 0.2, z: 0.1 };
        const scale = { x: 1.2, y: 0.8, z: 1.1 };
        const pivotOffset = getOverallPivotOffset(
            new THREE.Vector3(),
            center,
            rotation,
            scale
        );
        const euler = new THREE.Euler(rotation.x, rotation.y, rotation.z, 'XYZ');
        const scaleVector = new THREE.Vector3(scale.x, scale.y, scale.z);
        const originalPosition = point.clone().multiply(scaleVector).applyEuler(euler);
        const pivotedPosition = point
            .clone()
            .sub(center)
            .multiply(scaleVector)
            .applyEuler(euler)
            .add(pivotOffset);

        expect(pivotedPosition.x).toBeCloseTo(originalPosition.x);
        expect(pivotedPosition.y).toBeCloseTo(originalPosition.y);
        expect(pivotedPosition.z).toBeCloseTo(originalPosition.z);
    });
});
