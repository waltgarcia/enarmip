import Sidebar from './Sidebar'
import TopBar from './TopBar'
import BottomTabBar from './BottomTabBar'

export default function AppLayout({ title, children }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <TopBar title={title} />
      <main className="md:ml-60 pt-16 pb-20 md:pb-0 min-h-screen">
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>
      <BottomTabBar />
    </div>
  )
}
