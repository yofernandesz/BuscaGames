import "@testing-library/jest-dom";

// jsdom has no browser top layer. Real focus trapping is verified in the browser.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
