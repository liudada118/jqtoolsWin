import React from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

export function Dialog({ open, onOpenChange, children }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-50">
        {children}
      </div>
    </div>
  )
}

export function DialogContent({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'bg-white/95 backdrop-blur-sm border-none shadow-2xl rounded-xl p-8 max-w-[500px] w-full mx-4',
        'animate-in fade-in-0 zoom-in-95',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function DialogHeader({ className, children, ...props }) {
  return (
    <div className={cn('mb-6', className)} {...props}>
      {children}
    </div>
  )
}

export function DialogTitle({ className, children, ...props }) {
  return (
    <h2 className={cn('text-xl font-bold text-gray-800', className)} {...props}>
      {children}
    </h2>
  )
}

export default Dialog
