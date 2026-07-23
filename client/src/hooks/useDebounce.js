import { useEffect, useState } from "react";

/**
 * useDebounce
 * @param value 需要防抖处理的值
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的值
 */
export function useDebounce(value, delay = 300) {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        // 设置定时器
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        // 清理副作用：value 或 delay 改变时重置定时器
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
}
