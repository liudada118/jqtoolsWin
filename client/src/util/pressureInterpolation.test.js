import {
  addSide,
  compensateSingleColumnGaussian,
  gaussBlur_return,
  lineInterpnew,
} from './util';

test('1×4 侧翼沿高度方向插值并保留四个传感器端点', () => {
  expect(lineInterpnew([10, 20, 30, 40], 1, 4, 2, 2)).toEqual([
    10, 15, 20, 25, 30, 35, 40,
  ]);
});

test('单列矩阵补边时同时保留左右边界', () => {
  expect(addSide([10, 20], 1, 2, 1, 1)).toEqual([
    0, 0, 0,
    0, 10, 0,
    0, 20, 0,
    0, 0, 0,
  ]);
});

test('1×4 侧翼经过完整 3D 平滑流程后仍包含可渲染压力值', () => {
  const interpolated = lineInterpnew([40, 60, 80, 100], 1, 4, 2, 6);
  const padded = addSide(interpolated, 1, 19, 4, 4);
  const blurred = gaussBlur_return(padded, 9, 27, 2);
  const compensated = compensateSingleColumnGaussian(
    blurred,
    2,
    Math.max(...interpolated)
  );

  expect(interpolated).toHaveLength(19);
  expect(padded).toHaveLength(9 * 27);
  expect(blurred.every(Number.isFinite)).toBe(true);
  expect(Math.max(...blurred)).toBeGreaterThan(0);
  expect(Math.max(...compensated)).toBeGreaterThan(Math.max(...blurred) * 2);
  expect(Math.max(...compensated)).toBeLessThanOrEqual(Math.max(...interpolated));
});

test('单列侧翼与中间区域使用相同压力颜色强度', () => {
  const pressure = 100;
  const sideInterpolated = lineInterpnew(
    new Array(4).fill(pressure),
    1,
    4,
    4,
    9
  );
  const sidePadded = addSide(sideInterpolated, 1, 28, 4, 4);
  const sideBlurred = gaussBlur_return(sidePadded, 9, 36, 2);
  const sideCompensated = compensateSingleColumnGaussian(
    sideBlurred,
    2,
    pressure
  );
  const centerInterpolated = lineInterpnew(
    new Array(64).fill(pressure),
    8,
    8,
    6,
    15
  );
  const centerPadded = addSide(centerInterpolated, 43, 106, 3, 3);
  const centerBlurred = gaussBlur_return(centerPadded, 49, 112, 2);

  expect(Math.max(...sideBlurred)).toBeLessThan(pressure / 2);
  expect(Math.max(...sideCompensated)).toBeCloseTo(
    Math.max(...centerBlurred),
    0
  );
});
