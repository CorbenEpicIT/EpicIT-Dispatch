import { ssoExchange, getSsoProviders } from "../api/sso";
import { useMutation, useQuery } from "@tanstack/react-query";


export const useSsoExchangeMutation = () => {
    return useMutation({
        mutationFn: (code: string) => ssoExchange(code),
    })
}

export const useSsoProvidersQuery = () => {
    return useQuery({
        queryKey: ["ssoProviders"],
        queryFn: getSsoProviders,
        staleTime: 5 * 60 * 1000,
    })
}
