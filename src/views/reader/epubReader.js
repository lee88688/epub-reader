import React, { useState, useRef, useEffect } from 'react';
import ePub from 'epubjs';
import Popover from '@material-ui/core/Popover';
import HighlightEditor, { getColorsValue } from './HighlightEditor';
import { addMark, updateMark } from '../../api/mark';

export function useReader({ opfUrl, bookId }) {
  const rendition = useRef(null);
  const anchorEl = useRef(null);
  const [openPopover, setOpenPopover] = useState(false);
  const [curEditorValue, setCurEditorValue] = useState({ color: '', content: '', epubcfi: '' });
  const curEditorValueRef = useRef(null);
  const preEditorValue = useRef(curEditorValue);

  // point curEditorValueRef to curEditorValue
  curEditorValueRef.current = curEditorValue;

  const updateHighlightElement = (value, temporarily = true) => {
    const { epubcfi } =value;
    const g = document.querySelector(`g[data-epubcfi="${epubcfi}"]`);
    Object.keys(g.dataset).forEach(k => { g.dataset[k] = value[k]; });
    g.setAttribute('fill', getColorsValue(value.color));
    if (!temporarily) {
      // change rendition's annotations
    }
  };

  useEffect(() => {
    // const viewer = document.querySelector('#viewer');
    // console.log(viewer.clientHeight);
    const book = ePub(opfUrl);
    rendition.current = book.renderTo('viewer', {
      manager: 'continuous',
      flow: 'paginated',
      width: '100%',
      height: '100%',
      snap: true,
      script: '/epubjs-ext/rendition-injection.js'
    });
    rendition.current.display(0);

    let epubcfi = '';
    let selectedString = '';
    // when registered selected event, all references in selected callback function are frozen
    // curEditorValue will be changed, and it would not change in selected callback.
    // so it's important to change `curEditorValue` to `curEditorValueRef`.
    rendition.current.on('selected', function(cfiRange, contents) {
      if (!epubcfi) {
        const fn = async () => {
          contents.document.removeEventListener('mouseup', fn);
          const color ='red';
          const content = '';
          const cfi = epubcfi; // epubcfi will be set to null, save a copy.
          const curValue = { color, content, epubcfi, selectedString };
          rendition.current.annotations.highlight(
            epubcfi,
            { ...curValue },
            async e => {
              // new add highlight callback
              // void touchstart trigger
              if (e.type.startsWith('touch')) {
                e.stopPropagation();
                return;
              }
              const g = document.querySelector(`g[data-epubcfi="${cfi}"]`);
              const editorValue = { ...curEditorValueRef.current };
              Object.keys(g.dataset).forEach(k => editorValue[k] = g.dataset[k]);
              // console.log('editorValue', { ...editorValue });
              preEditorValue.current = { ...editorValue };
              setCurEditorValue(editorValue);
              anchorEl.current = e.target;
              setOpenPopover(true);
            },
            '',
            { fill: getColorsValue(color) }
          );
          setCurEditorValue({ ...curValue });
          const { data: markId } = await addMark(bookId, { ...curValue });
          setCurEditorValue({ ...curValue, id: markId });
          epubcfi = null;
          selectedString = '';
        };
        contents.document.addEventListener('mouseup', fn);
      }
      epubcfi = cfiRange;
      selectedString = contents.window.getSelection().toString();
    });
  }, [opfUrl]);

  useEffect(() => {
    if (openPopover && curEditorValue.epubcfi) {
      // find the highlight element and compare with the color before. if not the same, change element's color.
      updateHighlightElement(curEditorValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curEditorValue.color]);

  const handleEditorChange = value => setCurEditorValue(value);

  const handleEditorCancel = () => {
    // canceling will remove changes
    updateHighlightElement(preEditorValue.current);
    setOpenPopover(false);
  };

  const handleConfirm = async (value) => {
    const { id } = { ...curEditorValue, ...value };
    await updateMark(id, bookId, value);
    updateHighlightElement(value, false);
    setOpenPopover(false);
  };

  const bookItem = (
    <React.Fragment>
      <div id="viewer" style={{ 'height': '100%', width: '100%' }}></div>
      <Popover
        open={openPopover}
        anchorEl={anchorEl.current}
        onClose={handleEditorCancel}
        anchorOrigin={{ vertical: 'bottom' }}
      >
        <HighlightEditor
          {...curEditorValue}
          onChange={handleEditorChange}
          onConfirm={handleConfirm}
          onCancel={handleEditorCancel}
        />
      </Popover>
    </React.Fragment>
  );

  return {
    bookItem,
    rendition,
    nextPage: () => rendition.current ? rendition.current.next() : null,
    prevPage: () => rendition.current ? rendition.current.prev() : null
  };
}
