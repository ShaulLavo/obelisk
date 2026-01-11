/**
 * Performance Monitoring and Optimization Utilities
 *
 * Provides performance monitoring, lazy loading, and optimization
 * for font management operations.
 */

import { createSignal, createMemo, onCleanup } from 'solid-js';

export interface PerformanceMetrics {
	fontDownloadTime: number;
	fontInstallationTime: number;
	cacheHitRate: number;
	memoryUsage: number;
	renderTime: number;
	totalFontsLoaded: number;
}

export interface FontLoadingMetrics {
	fontName: string;
	downloadStartTime: number;
	downloadEndTime: number;
	installationStartTime: number;
	installationEndTime: number;
	cacheHit: boolean;
	size: number;
}

class FontPerformanceMonitor {
	private static instance: FontPerformanceMonitor;
	private metrics: Map<string, FontLoadingMetrics> = new Map();
	private performanceDataSignal = createSignal<PerformanceMetrics>({
		fontDownloadTime: 0,
		fontInstallationTime: 0,
		cacheHitRate: 0,
		memoryUsage: 0,
		renderTime: 0,
		totalFontsLoaded: 0,
	});
	private performanceData = this.performanceDataSignal[0];
	private setPerformanceData = this.performanceDataSignal[1];

	static getInstance(): FontPerformanceMonitor {
		if (!FontPerformanceMonitor.instance) {
			FontPerformanceMonitor.instance = new FontPerformanceMonitor();
		}
		return FontPerformanceMonitor.instance;
	}

	/**
	 * Start tracking a font download operation
	 */
	startFontDownload(fontName: string): void {
		const existing = this.metrics.get(fontName) || ({} as FontLoadingMetrics);
		this.metrics.set(fontName, {
			...existing,
			fontName,
			downloadStartTime: performance.now(),
			cacheHit: false,
		});
	}

	/**
	 * Mark font download as complete
	 */
	completeFontDownload(fontName: string, fromCache: boolean = false): void {
		const metric = this.metrics.get(fontName);
		if (metric) {
			metric.downloadEndTime = performance.now();
			metric.cacheHit = fromCache;
			this.updateAggregateMetrics();
		}
	}

	/**
	 * Start tracking font installation
	 */
	startFontInstallation(fontName: string): void {
		const metric = this.metrics.get(fontName);
		if (metric) {
			metric.installationStartTime = performance.now();
		}
	}

	/**
	 * Mark font installation as complete
	 */
	completeFontInstallation(fontName: string, size: number): void {
		const metric = this.metrics.get(fontName);
		if (metric) {
			metric.installationEndTime = performance.now();
			metric.size = size;
			this.updateAggregateMetrics();
		}
	}

	/**
	 * Get current performance metrics
	 */
	getMetrics(): PerformanceMetrics {
		return this.performanceData();
	}

	/**
	 * Get detailed metrics for a specific font
	 */
	getFontMetrics(fontName: string): FontLoadingMetrics | undefined {
		return this.metrics.get(fontName);
	}

	/**
	 * Clear all metrics
	 */
	clearMetrics(): void {
		this.metrics.clear();
		this.setPerformanceData({
			fontDownloadTime: 0,
			fontInstallationTime: 0,
			cacheHitRate: 0,
			memoryUsage: 0,
			renderTime: 0,
			totalFontsLoaded: 0,
		});
	}

	/**
	 * Get performance report as string
	 */
	getPerformanceReport(): string {
		const metrics = this.getMetrics();
		const fontMetrics = Array.from(this.metrics.values());

		let report = '=== Font Performance Report ===\n';
		report += `Total Fonts Loaded: ${metrics.totalFontsLoaded}\n`;
		report += `Average Download Time: ${metrics.fontDownloadTime.toFixed(2)}ms\n`;
		report += `Average Installation Time: ${metrics.fontInstallationTime.toFixed(2)}ms\n`;
		report += `Cache Hit Rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%\n`;
		report += `Memory Usage: ${(metrics.memoryUsage / 1024 / 1024).toFixed(2)}MB\n`;
		report += `Render Time: ${metrics.renderTime.toFixed(2)}ms\n\n`;

		if (fontMetrics.length > 0) {
			report += '=== Individual Font Metrics ===\n';
			fontMetrics.forEach((metric) => {
				const downloadTime = metric.downloadEndTime - metric.downloadStartTime;
				const installTime =
					metric.installationEndTime - metric.installationStartTime;
				report += `${metric.fontName}:\n`;
				report += `  Download: ${downloadTime.toFixed(2)}ms ${metric.cacheHit ? '(cached)' : '(network)'}\n`;
				report += `  Install: ${installTime.toFixed(2)}ms\n`;
				report += `  Size: ${(metric.size / 1024).toFixed(1)}KB\n\n`;
			});
		}

		return report;
	}

	private updateAggregateMetrics(): void {
		const fontMetrics = Array.from(this.metrics.values());
		const completedMetrics = fontMetrics.filter(
			(m) => m.downloadEndTime && m.installationEndTime
		);

		if (completedMetrics.length === 0) return;

		const totalDownloadTime = completedMetrics.reduce(
			(sum, m) => sum + (m.downloadEndTime - m.downloadStartTime),
			0
		);
		const totalInstallTime = completedMetrics.reduce(
			(sum, m) => sum + (m.installationEndTime - m.installationStartTime),
			0
		);
		const cacheHits = completedMetrics.filter((m) => m.cacheHit).length;
		const totalSize = completedMetrics.reduce(
			(sum, m) => sum + (m.size || 0),
			0
		);

		this.setPerformanceData({
			fontDownloadTime: totalDownloadTime / completedMetrics.length,
			fontInstallationTime: totalInstallTime / completedMetrics.length,
			cacheHitRate: cacheHits / completedMetrics.length,
			memoryUsage: totalSize,
			renderTime: this.measureRenderTime(),
			totalFontsLoaded: completedMetrics.length,
		});
	}

	private measureRenderTime(): number {
		// Simple render time measurement
		const start = performance.now();
		// Force a small reflow
		document.body.offsetHeight;
		return performance.now() - start;
	}
}

/**
 * Hook for accessing performance monitoring
 */
export function usePerformanceMonitor() {
	const monitor = FontPerformanceMonitor.getInstance();

	return {
		startFontDownload: (fontName: string) =>
			monitor.startFontDownload(fontName),
		completeFontDownload: (fontName: string, fromCache?: boolean) =>
			monitor.completeFontDownload(fontName, fromCache),
		startFontInstallation: (fontName: string) =>
			monitor.startFontInstallation(fontName),
		completeFontInstallation: (fontName: string, size: number) =>
			monitor.completeFontInstallation(fontName, size),
		getMetrics: () => monitor.getMetrics(),
		getFontMetrics: (fontName: string) => monitor.getFontMetrics(fontName),
		clearMetrics: () => monitor.clearMetrics(),
		getPerformanceReport: () => monitor.getPerformanceReport(),
	};
}

/**
 * Lazy loading utility for font previews
 */
export function createLazyFontPreview() {
	const isVisibleSignal = createSignal(false);
	const isVisible = isVisibleSignal[0];
	const setIsVisible = isVisibleSignal[1];

	const elementSignal = createSignal<HTMLElement>();
	const element = elementSignal[0];
	const setElement = elementSignal[1];

	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					setIsVisible(true);
					observer.disconnect();
				}
			});
		},
		{ threshold: 0.1 }
	);

	const ref = (el: HTMLElement) => {
		setElement(el);
		observer.observe(el);
	};

	onCleanup(() => {
		observer.disconnect();
	});

	return {
		ref,
		isVisible,
		element,
	};
}

/**
 * Font loading optimization utilities
 */
export class FontLoadingOptimizer {
	private static readonly MAX_CONCURRENT_DOWNLOADS = 3;
	private static readonly DOWNLOAD_TIMEOUT = 30000; // 30 seconds
	private static downloadQueue: Array<() => Promise<void>> = [];
	private static activeDownloads = 0;

	/**
	 * Queue a font download with concurrency control
	 */
	static async queueFontDownload(
		fontName: string,
		downloadFn: () => Promise<void>
	): Promise<void> {
		return new Promise((resolve, reject) => {
			const wrappedDownload = async () => {
				const monitor = FontPerformanceMonitor.getInstance();

				try {
					this.activeDownloads++;
					monitor.startFontDownload(fontName);

					// Add timeout
					const timeoutPromise = new Promise<never>((_, reject) => {
						setTimeout(
							() => reject(new Error('Download timeout')),
							this.DOWNLOAD_TIMEOUT
						);
					});

					await Promise.race([downloadFn(), timeoutPromise]);
					monitor.completeFontDownload(fontName);
					resolve();
				} catch (error) {
					console.error(`Font download failed for ${fontName}:`, error);
					reject(error);
				} finally {
					this.activeDownloads--;
					this.processQueue();
				}
			};

			if (this.activeDownloads < this.MAX_CONCURRENT_DOWNLOADS) {
				wrappedDownload();
			} else {
				this.downloadQueue.push(wrappedDownload);
			}
		});
	}

	private static processQueue(): void {
		if (
			this.downloadQueue.length > 0 &&
			this.activeDownloads < this.MAX_CONCURRENT_DOWNLOADS
		) {
			const nextDownload = this.downloadQueue.shift();
			if (nextDownload) {
				nextDownload();
			}
		}
	}

	/**
	 * Preload fonts that are likely to be used
	 */
	static preloadPopularFonts(fontNames: string[]): void {
		// Preload up to 3 popular fonts in the background
		const popularFonts = fontNames.slice(0, 3);

		popularFonts.forEach((fontName) => {
			// Use requestIdleCallback if available
			if ('requestIdleCallback' in window) {
				requestIdleCallback(() => {
					this.preloadFont(fontName);
				});
			} else {
				setTimeout(() => this.preloadFont(fontName), 100);
			}
		});
	}

	private static async preloadFont(fontName: string): Promise<void> {
		try {
			const { up } = await import('up-fetch');
			const upfetch = up(fetch);

			// Check if already cached
			const cache = await caches.open('nerdfonts-v1');
			const cacheKey = `/fonts/${fontName}`;
			const cached = await cache.match(cacheKey);

			if (!cached) {
				// Preload from server
				const response = await upfetch(`/fonts/${fontName}`, {
					parseResponse: (res) => res
				});
				if (response.ok) {
					await cache.put(cacheKey, response);
					console.log(`Preloaded font: ${fontName}`);
				}
			}
		} catch (error) {
			console.warn(`Failed to preload font ${fontName}:`, error);
		}
	}
}

/**
 * Memory usage monitoring
 */
export function createMemoryMonitor() {
	// Extend Performance interface for Chrome's memory API
	interface PerformanceWithMemory extends Performance {
		memory?: {
			usedJSHeapSize: number;
			totalJSHeapSize: number;
			jsHeapSizeLimit: number;
		};
	}

	const memoryInfoSignal = createSignal<{
		usedJSHeapSize: number;
		totalJSHeapSize: number;
		jsHeapSizeLimit: number;
	} | null>(null);
	const memoryInfo = memoryInfoSignal[0];
	const setMemoryInfo = memoryInfoSignal[1];

	const updateMemoryInfo = () => {
		const performanceWithMemory = performance as PerformanceWithMemory;
		if (performanceWithMemory.memory) {
			const memory = performanceWithMemory.memory;
			setMemoryInfo({
				usedJSHeapSize: memory.usedJSHeapSize,
				totalJSHeapSize: memory.totalJSHeapSize,
				jsHeapSizeLimit: memory.jsHeapSizeLimit,
			});
		}
	};

	// Update memory info every 5 seconds
	const interval = setInterval(updateMemoryInfo, 5000);
	updateMemoryInfo(); // Initial update

	onCleanup(() => {
		clearInterval(interval);
	});

	const memoryUsagePercentage = createMemo(() => {
		const info = memoryInfo();
		if (!info) return 0;
		return (info.usedJSHeapSize / info.jsHeapSizeLimit) * 100;
	});

	return {
		memoryInfo,
		memoryUsagePercentage,
		updateMemoryInfo,
	};
}

/**
 * Performance debugging utilities
 */
export const PerformanceDebugger = {
	/**
	 * Log performance metrics to console
	 */
	logMetrics(): void {
		const monitor = FontPerformanceMonitor.getInstance();
		console.log(monitor.getPerformanceReport());
	},

	/**
	 * Export metrics as JSON
	 */
	exportMetrics(): string {
		const monitor = FontPerformanceMonitor.getInstance();
		return JSON.stringify(
			{
				timestamp: new Date().toISOString(),
				metrics: monitor.getMetrics(),
				individualMetrics: Array.from((monitor as any).metrics.values()),
			},
			null,
			2
		);
	},

	/**
	 * Start continuous monitoring
	 */
	startContinuousMonitoring(intervalMs: number = 10000): () => void {
		const interval = setInterval(() => {
			this.logMetrics();
		}, intervalMs);

		return () => clearInterval(interval);
	},
};
