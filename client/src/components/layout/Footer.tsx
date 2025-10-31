export default function Footer() {
  return (
    <footer className="bg-white px-4 py-4 mt-auto border-t border-neutral-medium dark:bg-gray-800 dark:border-gray-700">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <div className="text-sm text-neutral-dark dark:text-gray-400">
          &copy; {new Date().getFullYear()} DC People. All rights reserved.
        </div>
        <div className="mt-2 md:mt-0">
          <ul className="flex space-x-4">
            <li>
              <a href="#" className="text-sm text-neutral-dark hover:text-primary dark:text-gray-400 dark:hover:text-blue-300">
                Privacy Policy
              </a>
            </li>
            <li>
              <a href="#" className="text-sm text-neutral-dark hover:text-primary dark:text-gray-400 dark:hover:text-blue-300">
                Terms of Service
              </a>
            </li>
            <li>
              <a href="#" className="text-sm text-neutral-dark hover:text-primary dark:text-gray-400 dark:hover:text-blue-300">
                Help Center
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
