import { AiConsoleSql } from '@repo/icons/ai/AiConsoleSql'
import { Flex } from '@repo/ui/flex'

export const EmptyState = () => {
	return (
		<Flex
			flexDirection="col"
			alignItems="center"
			justifyContent="center"
			class="h-64 text-muted-foreground"
		>
			<Flex
				alignItems="center"
				justifyContent="center"
				class="w-12 h-12 rounded-full bg-muted mb-4 text-muted-foreground"
			>
				<AiConsoleSql size={24} />
			</Flex>
			<p>Select a table or run a query to get started</p>
		</Flex>
	)
}
