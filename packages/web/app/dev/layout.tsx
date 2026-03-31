export default function DevLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <div className='h-screen relative z-10 flex flex-col'>
            {children}
        </div>
    )
}
