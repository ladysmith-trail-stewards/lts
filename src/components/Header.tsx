function Header() {
  return (
    <header className="bg-green-700 text-white shadow">
      <div className="container mx-auto flex justify-between items-center p-4">
        <div className="flex items-center space-x-2">
          <img
            src="/images/logo.jpg"
            alt="Ladysmith Logo"
            className="h-10 w-auto"
          />
          <span className="text-xl font-bold">Ladysmith Trail Stewards</span>
        </div>
        <nav>
          <a href="/charter.html" className="hover:underline">
            Charter
          </a>
        </nav>
      </div>
    </header>
  );
}

export default Header;
