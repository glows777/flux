/**
 * Flux OS Design System - Liquid Obsidian
 * 设计 token 配置
 */

/**
 * 颜色系统
 */
export const colors = {
    // 背景色
    void: '#030303', // Deep Void
    surface: {
        base: 'rgba(255, 255, 255, 0.02)',
        hover: 'rgba(255, 255, 255, 0.05)',
        active: 'rgba(255, 255, 255, 0.08)',
    },

    // 文字色
    text: {
        primary: '#FFFFFF',
        secondary: '#94A3B8', // slate-400
        tertiary: '#64748B', // slate-500
        muted: '#475569', // slate-600
    },

    // 语义色
    semantic: {
        success: '#10B981', // emerald-500
        warning: '#F59E0B', // amber-500
        error: '#F43F5E', // rose-500
        info: '#3B82F6', // blue-500
    },

    // 边框色
    border: {
        base: 'rgba(255, 255, 255, 0.05)',
        hover: 'rgba(255, 255, 255, 0.10)',
        focus: 'rgba(16, 185, 129, 0.30)', // emerald with opacity
    },

    // 品牌色 - Emerald
    brand: {
        50: '#ECFDF5',
        100: '#D1FAE5',
        200: '#A7F3D0',
        300: '#6EE7B7',
        400: '#34D399',
        500: '#10B981',
        600: '#059669',
        700: '#047857',
        800: '#065F46',
        900: '#064E3B',
    },
}

/**
 * 字体系统
 */
export const fonts = {
    sans: 'var(--font-inter)',
    mono: 'var(--font-jetbrains-mono)',

    weights: {
        light: 300,
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
    },

    sizes: {
        xs: '0.625rem', // 10px
        sm: '0.75rem', // 12px
        base: '0.875rem', // 14px
        lg: '1rem', // 16px
        xl: '1.25rem', // 20px
        '2xl': '1.5rem', // 24px
        '3xl': '1.875rem', // 30px
        '4xl': '2.25rem', // 36px
        '5xl': '3rem', // 48px
    },
}

/**
 * 视觉效果
 */
export const effects = {
    // 模糊效果
    blur: {
        sm: '4px',
        md: '8px',
        lg: '16px',
        xl: '24px',
        '2xl': '40px',
        '3xl': '64px',
    },

    // 阴影
    shadow: {
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    },

    // 光晕 (Glow)
    glow: {
        emerald: {
            sm: '0 0 10px rgba(16, 185, 129, 0.3)',
            md: '0 0 20px rgba(16, 185, 129, 0.4)',
            lg: '0 0 40px rgba(16, 185, 129, 0.5)',
        },
        white: {
            sm: '0 0 10px rgba(255, 255, 255, 0.1)',
            md: '0 0 20px rgba(255, 255, 255, 0.15)',
            lg: '0 0 40px rgba(255, 255, 255, 0.2)',
        },
    },
}

/**
 * 动画时长
 */
export const animations = {
    duration: {
        fast: '150ms',
        base: '200ms',
        slow: '300ms',
        slower: '500ms',
    },

    easing: {
        linear: 'linear',
        in: 'cubic-bezier(0.4, 0, 1, 1)',
        out: 'cubic-bezier(0, 0, 0.2, 1)',
        inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
}
