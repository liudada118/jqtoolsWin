import React, { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import { Scheduler } from '@/scheduler/scheduler'

export function PressureChart({ data, title = '?????????' }) {
  const chartRef = useRef(null)
  const chartInstance = useRef(null)
  const dataRef = useRef(data)

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    if (!chartRef.current) return
    chartInstance.current = echarts.init(chartRef.current)

    const renderChart = () => {
      const safeData = Array.isArray(dataRef.current) ? dataRef.current : []
      const option = {
        grid: {
          top: 10,
          right: 10,
          bottom: 20,
          left: 30,
        },
        xAxis: {
          type: 'category',
          data: safeData.map((_, i) => i),
          show: false,
        },
        yAxis: {
          type: 'value',
          show: false,
        },
        series: [
          {
            data: safeData.map(d => d.value),
            type: 'line',
            smooth: true,
            symbol: 'none',
            lineStyle: {
              color: '#3B82F6',
              width: 2,
            },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
                { offset: 1, color: 'rgba(59, 130, 246, 0)' },
              ]),
            },
          },
        ],
      }
      chartInstance.current?.setOption(option, { notMerge: true })
    }

    renderChart()
    const unsubscribe = Scheduler.onUI(renderChart)

    return () => {
      unsubscribe?.()
      if (chartInstance.current) {
        chartInstance.current.dispose()
      }
    }
  }, [])

  useEffect(() => {
    const handleResize = () => {
      if (chartInstance.current) {
        chartInstance.current.resize()
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return <div ref={chartRef} className="w-full h-full" />
}

export function NormalDistributionChart({ data }) {
  const chartRef = useRef(null)
  const chartInstance = useRef(null)
  const dataRef = useRef(data)

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    if (!chartRef.current) return
    chartInstance.current = echarts.init(chartRef.current)

    const renderChart = () => {
      const safeData = Array.isArray(dataRef.current) ? dataRef.current : []
      const option = {
        grid: {
          top: 10,
          right: 10,
          bottom: 20,
          left: 30,
        },
        xAxis: {
          type: 'category',
          data: safeData.map(d => d.x.toFixed(1)),
          show: false,
        },
        yAxis: {
          type: 'value',
          show: false,
        },
        series: [
          {
            data: safeData.map(d => d.y),
            type: 'line',
            smooth: true,
            symbol: 'none',
            lineStyle: {
              color: '#3B82F6',
              width: 2,
            },
          },
        ],
      }
      chartInstance.current?.setOption(option, { notMerge: true })
    }

    renderChart()
    const unsubscribe = Scheduler.onUI(renderChart)

    return () => {
      unsubscribe?.()
      if (chartInstance.current) {
        chartInstance.current.dispose()
      }
    }
  }, [])

  useEffect(() => {
    const handleResize = () => {
      if (chartInstance.current) {
        chartInstance.current.resize()
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return <div ref={chartRef} className="w-full h-full" />
}

export default PressureChart
