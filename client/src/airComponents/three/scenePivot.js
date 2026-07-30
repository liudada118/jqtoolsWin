import * as THREE from 'three';

/**
 * 计算目标对象在指定祖先节点局部坐标系中的包围盒中心。
 * 返回 null 表示模型尚未加载出可计算包围盒的网格。
 */
export function getObjectBoundsCenterInAncestor(object, ancestor) {
    if (!object || !ancestor) return null;

    ancestor.updateWorldMatrix(true, true);
    object.updateWorldMatrix(true, true);

    const ancestorWorldInverse = ancestor.matrixWorld.clone().invert();
    const bounds = new THREE.Box3();

    object.traverse((node) => {
        if (!node.isMesh || !node.geometry) return;

        if (!node.geometry.boundingBox) {
            node.geometry.computeBoundingBox();
        }
        if (!node.geometry.boundingBox) return;

        const nodeToAncestor = new THREE.Matrix4().multiplyMatrices(
            ancestorWorldInverse,
            node.matrixWorld
        );
        bounds.union(node.geometry.boundingBox.clone().applyMatrix4(nodeToAncestor));
    });

    return bounds.isEmpty() ? null : bounds.getCenter(new THREE.Vector3());
}

/**
 * 计算内容中心变化后枢轴需要补偿的位移。
 * Three.js 对局部坐标按缩放、旋转、平移的顺序变换，因此这里保持相同顺序。
 */
export function getOverallPivotOffset(previousCenter, nextCenter, rotation, scale) {
    return nextCenter
        .clone()
        .sub(previousCenter)
        .multiply(new THREE.Vector3(scale.x, scale.y, scale.z))
        .applyEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z, 'XYZ'));
}
