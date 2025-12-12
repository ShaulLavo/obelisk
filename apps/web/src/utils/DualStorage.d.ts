declare class DualStorage implements Storage {
	private getUniqueKeys
	get length(): number
	clear(): void
	getItem(key: string): string | null
	key(index: number): string | null
	removeItem(key: string): void
	setItem(key: string, value: string): void
}
export declare const dualStorage: DualStorage
export {}
//# sourceMappingURL=DualStorage.d.ts.map
